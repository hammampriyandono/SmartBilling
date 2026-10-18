import {createPool,requireDevelopment} from '../src/connections.js';
// Read-only hashes, never log row contents (users contain password hashes).
requireDevelopment();const pool=createPool({timeout:30000});
try {
 const tables=(await pool.query(`SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('public','dev_checks') ORDER BY schemaname,tablename`)).rows;
 const snapshot={};
 for(const {schemaname,tablename} of tables){
  if(!/^[a-z_]+$/.test(schemaname)||!/^[a-z_]+$/.test(tablename))throw new Error('unsafe_table_name');
  snapshot[`${schemaname}.${tablename}`]=(await pool.query(`SELECT count(*)::int count,md5(COALESCE(string_agg(row_to_json(r)::text,'' ORDER BY row_to_json(r)::text),'')) fingerprint FROM "${schemaname}"."${tablename}" r`)).rows[0];
 }
 console.info(JSON.stringify(snapshot));
}finally{await pool.end();}
