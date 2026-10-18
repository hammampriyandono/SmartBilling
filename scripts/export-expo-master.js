import {writeFile} from 'node:fs/promises';
import {createPool,requireDevelopment} from '../src/connections.js';
requireDevelopment();
let input='';for await(const chunk of process.stdin)input+=chunk;
const selected=JSON.parse(input),path=process.argv[2];
if(!/^\/tmp\/expo-master-[a-f0-9-]+\.json$/.test(path||''))throw new Error('invalid_export_path');
const ids=[selected.owner_id,selected.property_id,...selected.room_ids,...selected.tenant_ids];
if(ids.some(id=>!/^[a-f0-9-]{36}$/.test(id)))throw new Error('invalid_selection');
const pool=createPool({timeout:15000}),db=await pool.connect();
try{
 await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const query=async(sql,args)=>(await db.query(sql,args)).rows;
 const users=await query('SELECT * FROM users WHERE id=ANY($1::uuid[]) ORDER BY id',[[selected.owner_id,...selected.tenant_ids]]);
 const properties=await query('SELECT * FROM properties WHERE id=$1 AND owner_id=$2',[selected.property_id,selected.owner_id]);
 const rooms=await query("SELECT * FROM rooms WHERE id=ANY($1::uuid[]) AND property_id=$2 AND source='manual' ORDER BY id",[selected.room_ids,selected.property_id]);
 const memberships=await query("SELECT * FROM property_tenants WHERE property_id=$1 AND user_id=ANY($2::uuid[]) AND source='manual' ORDER BY id",[selected.property_id,selected.tenant_ids]);
 const occupancies=await query("SELECT * FROM occupancies WHERE room_id=ANY($1::uuid[]) AND user_id=ANY($2::uuid[]) AND source='manual' ORDER BY id",[selected.room_ids,selected.tenant_ids]);
 if(properties.length!==1||rooms.length!==selected.room_ids.length||users.length!==1+selected.tenant_ids.length||memberships.length!==selected.tenant_ids.length||users.find(x=>x.id===selected.owner_id)?.role!=='owner'||users.filter(x=>selected.tenant_ids.includes(x.id)).some(x=>x.role!=='tenant'))throw new Error('selection_mismatch');
 const migrations=await query('SELECT name,checksum FROM schema_migrations ORDER BY name');
 const data={users,properties,rooms,property_tenants:memberships,occupancies};
 // Neutral labels on the new rehearsal copy only; identity/login remains unchanged.
 data.users.find(x=>x.id===selected.owner_id).name='Owner';data.properties[0].name='Kost';
 await writeFile(path,JSON.stringify({migrations,data}),{flag:'wx',mode:0o600});
 await db.query('COMMIT');
 console.info('Master manual terpilih diekspor ke berkas privat; isi dan credential tidak dicetak.');
}catch{await db.query('ROLLBACK');console.error('Ekspor master dibatalkan.');process.exitCode=1;}
finally{db.release();await pool.end();}
