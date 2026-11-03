import {createHash} from 'node:crypto';
import {visibleAdministration,isArchivedTestRecord} from '../src/display-policy.js';

// Fixed identifiers only: package data can never choose tables or SQL columns.
export const masterColumns={
 users:'id name email password_hash role is_active created_at row_version updated_at',
 properties:'id owner_id name timezone created_at row_version updated_at',
 rooms:'id property_id code name active_from active_until source row_version updated_at',
 property_tenants:'id property_id user_id status source created_at ended_at row_version updated_at',
 occupancies:'id user_id room_id starts_at ends_at created_at source row_version updated_at',
 devices:'id property_id device_uid firmware_version status last_seen_at created_at display_name source deactivated_at row_version updated_at',
 communal_loads:'id property_id name load_type is_active source row_version updated_at',
 meter_assets:'id property_id serial_number label model status source created_at retired_at row_version updated_at',
 meters:'id property_id device_id room_id communal_load_id kind channel_no serial_number installed_at retired_at meter_asset_id source row_version updated_at',
};
export const masterTables=Object.keys(masterColumns);
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const fail=code=>{throw new Error(code);};
export function stable(value){
 if(Array.isArray(value))return `[${value.map(stable).join(',')}]`;
 if(value&&typeof value==='object')return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
 return JSON.stringify(value);
}
export const digest=value=>createHash('sha256').update(stable(value)).digest('hex');
export function sealMasterPackage(body){return {...body,sha256:digest(body)};}
function micros(value){
 const match=typeof value==='string'&&/^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,6}))?(Z|[+-]\d\d:\d\d)$/.exec(value);
 if(!match||!Number.isFinite(Date.parse(match[1]+match[3])))fail('invalid_master_timestamp');
 return BigInt(Date.parse(match[1]+match[3]))*1000n+BigInt((match[2]||'').padEnd(6,'0'));
}
const overlaps=(a,b,start,end)=>
 (b[end]===null||micros(a[start])<micros(b[end]))&&(a[end]===null||micros(b[start])<micros(a[end]));
export function validateMasterPackage(payload){
 if(!payload||typeof payload!=='object'||Object.keys(payload).sort().join()!==
  ['format','property_id','exported_at','migrations','data','sha256'].sort().join()||payload.format!=='smartbilling-master-v1'||!uuid.test(payload.property_id))fail('invalid_master_package');
 const {sha256,...body}=payload;
 if(!/^[a-f0-9]{64}$/.test(sha256)||digest(body)!==sha256)fail('master_checksum_mismatch');
 micros(payload.exported_at);
 if(!Array.isArray(payload.migrations)||!payload.migrations.length||payload.migrations.some(row=>
  !row||Object.keys(row).sort().join()!=='checksum,name'||!/^\d{3}_[a-z0-9_]+\.sql$/.test(row.name)||!/^[a-f0-9]{64}$/.test(row.checksum))||
  new Set(payload.migrations.map(row=>row.name)).size!==payload.migrations.length)fail('invalid_master_migrations');
 if(!payload.data||Object.keys(payload.data).sort().join()!==[...masterTables].sort().join())fail('invalid_master_tables');
 const maps={};
 for(const table of masterTables){
  const rows=payload.data[table],keys=masterColumns[table].split(' ').sort().join();
  if(!Array.isArray(rows)||rows.length>5000)fail('invalid_master_rows');
  maps[table]=new Map();
  for(const row of rows){
   if(!row||Object.keys(row).sort().join()!==keys||!uuid.test(row.id)||maps[table].has(row.id)||isArchivedTestRecord(row))fail('invalid_master_row');
   if('source' in row&&row.source!=='manual')fail('non_manual_master');
   if('property_id' in row&&row.property_id!==payload.property_id)fail('cross_property_master');
   if(!Number.isInteger(row.row_version)||row.row_version<1)fail('invalid_master_version');
   for(const [key,value] of Object.entries(row)){
    if(key.endsWith('_id')&&value!==null&&!uuid.test(value))fail('invalid_master_reference');
    if((key.endsWith('_at')||['active_from','active_until'].includes(key))&&value!==null)micros(value);
   }
   maps[table].set(row.id,row);
  }
 }
 const property=maps.properties.get(payload.property_id);
 if(maps.properties.size!==1||!property||maps.users.get(property.owner_id)?.role!=='owner')fail('invalid_master_owner');
 const reference=(table,id)=>{if(!maps[table].has(id))fail('missing_master_reference');};
 const tenant=id=>{if(maps.users.get(id)?.role!=='tenant')fail('invalid_master_tenant');};
 const involved=new Set([property.owner_id]);
 for(const row of payload.data.property_tenants){tenant(row.user_id);involved.add(row.user_id);}
 for(const row of payload.data.occupancies){
  tenant(row.user_id);reference('rooms',row.room_id);involved.add(row.user_id);
  if(!payload.data.property_tenants.some(member=>member.user_id===row.user_id))fail('missing_master_membership');
 }
 if(payload.data.users.some(row=>!involved.has(row.id)))fail('unrelated_master_account');
 for(const row of payload.data.devices)if(row.last_seen_at!==null)fail('device_liveness_not_transferable');
 for(const row of payload.data.meters){
  reference('devices',row.device_id);reference('meter_assets',row.meter_asset_id);
  if(row.kind==='room'&&row.room_id!==null&&row.communal_load_id===null)reference('rooms',row.room_id);
  else if(row.kind==='communal'&&row.communal_load_id!==null&&row.room_id===null)reference('communal_loads',row.communal_load_id);
  else if(row.kind!=='main'||row.room_id!==null||row.communal_load_id!==null)fail('invalid_master_meter_target');
 }
 return payload;
}
const rows=async(db,table,where='',args=[])=>
 (await db.query(`SELECT to_jsonb(t) AS row FROM ${table} t ${where} ORDER BY id`,args)).rows.map(result=>result.row);
const migrations=async db=>(await db.query('SELECT name,checksum FROM schema_migrations ORDER BY name')).rows;
export async function exportMasterPackage(db,propertyId){
 if(!uuid.test(propertyId))fail('invalid_property_id');
 await db.query("SET LOCAL TIME ZONE 'UTC'");
 const data={properties:await rows(db,'properties','WHERE id=$1',[propertyId])};
 if(data.properties.length!==1)fail('property_not_found');
 for(const table of ['rooms','property_tenants','devices','communal_loads','meter_assets','meters'])
  data[table]=await rows(db,table,"WHERE property_id=$1 AND source='manual'",[propertyId]);
 data.occupancies=await rows(db,'occupancies',"WHERE source='manual' AND room_id=ANY($1::uuid[])",[data.rooms.map(row=>row.id)]);
 data.users=await rows(db,'users','WHERE id=ANY($1::uuid[])',[[data.properties[0].owner_id,...data.property_tenants.map(row=>row.user_id),...data.occupancies.map(row=>row.user_id)]]);
 const visible=visibleAdministration(data);
 // last_seen_at is local observation metadata, not portable evidence of connectivity.
 visible.devices=visible.devices.map(row=>({...row,last_seen_at:null}));
 const payload=sealMasterPackage({format:'smartbilling-master-v1',property_id:propertyId,exported_at:new Date().toISOString(),migrations:await migrations(db),data:visible});
 return validateMasterPackage(payload);
}
function naturalConflict(table,a,b){
 if(a.id===b.id)return false;
 if(table==='users')return a.email===b.email;
 if(table==='devices')return a.device_uid===b.device_uid;
 if(table==='rooms')return a.property_id===b.property_id&&a.code===b.code;
 if(table==='meter_assets')return a.property_id===b.property_id&&a.serial_number!==null&&a.serial_number===b.serial_number;
 if(table==='property_tenants')return a.property_id===b.property_id&&a.user_id===b.user_id;
 if(table==='occupancies')return a.user_id===b.user_id&&overlaps(a,b,'starts_at','ends_at');
 if(table==='meters')return overlaps(a,b,'installed_at','retired_at')&&(
  a.meter_asset_id===b.meter_asset_id||(a.device_id===b.device_id&&a.channel_no===b.channel_no)||
  (a.kind==='main'&&b.kind==='main'&&a.property_id===b.property_id)||
  (a.room_id!==null&&a.room_id===b.room_id)||(a.communal_load_id!==null&&a.communal_load_id===b.communal_load_id));
 return false;
}
export async function planMasterPackage(db,payload){
 validateMasterPackage(payload);
 await db.query("SET LOCAL TIME ZONE 'UTC'");
 const targetMigrations=await migrations(db),conflicts=[],insertRows={},unchanged={},target={};
 const schemaMatches=stable(targetMigrations)===stable(payload.migrations);
 if(!schemaMatches)conflicts.push({reason:'schema_mismatch'});
 for(const table of masterTables){
  target[table]=await rows(db,table);
  if(table==='devices')target[table]=target[table].map(row=>({...row,last_seen_at:null}));
  insertRows[table]=[];unchanged[table]=0;
 }
 if(schemaMatches)for(const table of masterTables){
  // PostgreSQL canonicalizes time offsets and numeric/boolean representations.
  const incoming=(await db.query(`SELECT to_jsonb(t) AS row FROM json_populate_recordset(NULL::${table},$1::json) t ORDER BY id`,[JSON.stringify(payload.data[table])])).rows.map(result=>result.row);
  const effective=[...target[table]];
  for(const row of incoming){
   const existing=effective.find(other=>other.id===row.id);
   if(existing){
    const fields=Object.keys(row).filter(key=>stable(existing[key])!==stable(row[key]));
    if(fields.length)conflicts.push({table,id:row.id,reason:'existing_id_differs',fields});
    else unchanged[table]++;
   }else{
    const other=effective.find(other=>naturalConflict(table,row,other));
    if(other)conflicts.push({table,id:row.id,other_id:other.id,reason:'identity_or_interval_conflict'});
    else {insertRows[table].push(row);effective.push(row);}
   }
  }
 }
 const report={format:'smartbilling-master-plan-v1',package_sha256:payload.sha256,target_sha256:digest({migrations:targetMigrations,data:target}),
  schema_matches:schemaMatches,can_apply:conflicts.length===0,insert_counts:Object.fromEntries(masterTables.map(table=>[table,insertRows[table].length])),unchanged,
  conflict_count:conflicts.length,conflicts:conflicts.slice(0,200)};
 return {report:{...report,plan_sha256:digest(report)},insertRows};
}
export async function applyMasterPackage(pool,payload,expectedPlan){
 if(!/^[a-f0-9]{64}$/.test(expectedPlan||''))fail('reviewed_plan_required');
 const db=await pool.connect();
 try{
  await db.query('BEGIN');
  await db.query('SELECT pg_advisory_xact_lock(505001)');
  await db.query('SELECT pg_advisory_xact_lock(505029)');
  await db.query(`LOCK TABLE ${masterTables.join(',')} IN SHARE ROW EXCLUSIVE MODE`);
  const {report,insertRows}=await planMasterPackage(db,payload);
  if(report.plan_sha256!==expectedPlan)fail('master_plan_stale');
  if(!report.can_apply)fail('master_conflicts_present');
  for(const table of masterTables)if(insertRows[table].length)
   await db.query(`INSERT INTO ${table} SELECT * FROM json_populate_recordset(NULL::${table},$1::json)`,[JSON.stringify(insertRows[table])]);
  await db.query('COMMIT');
  return {status:'master_imported',package_sha256:payload.sha256,inserted:report.insert_counts,unchanged:report.unchanged};
 }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}
 finally{db.release();}
}
