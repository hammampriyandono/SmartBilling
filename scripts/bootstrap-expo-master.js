import {createHash} from 'node:crypto';
import {createPool,requireDevelopment} from '../src/connections.js';
import {isArchivedTestRecord} from '../src/display-policy.js';
requireDevelopment();
if(process.env.EXPO_LOCAL_BOOTSTRAP!=='1')throw new Error('local_bootstrap_flag_required');
let input='';for await(const chunk of process.stdin)input+=chunk;
const payload=JSON.parse(input),tables=['users','properties','rooms','property_tenants','occupancies'];
if(!payload.data||Object.keys(payload.data).sort().join()!==[...tables].sort().join())throw new Error('invalid_bootstrap_tables');
for(const [table,rows] of Object.entries(payload.data))if(!Array.isArray(rows)||rows.some(row=>isArchivedTestRecord(row)))throw new Error('test_master_not_allowed');
const pool=createPool({timeout:15000}),db=await pool.connect();
try{
 await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(505018)');
 const migrations=(await db.query('SELECT name,checksum FROM schema_migrations ORDER BY name')).rows;
 if(JSON.stringify(migrations)!==JSON.stringify(payload.migrations))throw new Error('schema_mismatch');
 const publicTables=(await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'schema_migrations'")).rows;
 for(const {tablename} of publicTables){
  if(!/^[a-z_]+$/.test(tablename))throw new Error('invalid_table');
  if((await db.query(`SELECT 1 FROM "${tablename}" LIMIT 1`)).rowCount)throw new Error('target_not_empty');
 }
 for(const table of tables)await db.query(`INSERT INTO ${table} SELECT * FROM json_populate_recordset(NULL::${table},$1::json)`,[JSON.stringify(payload.data[table])]);
 await db.query('COMMIT');
 console.info(JSON.stringify({status:'manual_master_ready',counts:Object.fromEntries(tables.map(table=>[table,payload.data[table].length])),export_sha256:createHash('sha256').update(input).digest('hex')}));
}catch(error){await db.query('ROLLBACK');console.error('Bootstrap dibatalkan; target tidak ditimpa.',error.code||error.message);process.exitCode=1;}
finally{db.release();await pool.end();}
