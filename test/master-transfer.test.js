import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import {spawnSync} from 'node:child_process';
import express from 'express';
import {createPool,requireDevelopment} from '../src/connections.js';
import {authentication} from '../src/auth.js';
import {hashPassword} from '../src/password.js';
import {monitoringApi,apiError} from '../src/monitoring-api.js';
import {masterTables,masterColumns,sealMasterPackage,validateMasterPackage,exportMasterPackage,planMasterPackage,applyMasterPackage} from '../scripts/master-transfer.js';

function emptyPackage(){
 return sealMasterPackage({format:'smartbilling-master-v1',property_id:randomUUID(),exported_at:new Date().toISOString(),
  migrations:[{name:'001_monitoring.sql',checksum:'a'.repeat(64)}],data:Object.fromEntries(masterTables.map(table=>[table,[]]))});
}
test('paket master menolak perubahan checksum, tabel ekstra, kolom rahasia asing dan graph kosong',()=>{
 const payload=emptyPackage();
 assert.throws(()=>validateMasterPackage({...payload,exported_at:'2026-10-01T00:00:00Z'}),/checksum/);
 const {sha256,...body}=payload;
 assert.throws(()=>validateMasterPackage(sealMasterPackage({...body,data:{...body.data,meter_readings:[]}})),/tables/);
 const user=Object.fromEntries(masterColumns.users.split(' ').map(key=>[key,null]));
 assert.throws(()=>validateMasterPackage(sealMasterPackage({...body,data:{...body.data,users:[{...user,id:randomUUID(),password:'must-not-be-accepted'}]}})),/row/);
 assert.throws(()=>validateMasterPackage(payload),/owner/);
});

test('PostgreSQL transfer: seluruh master, microsecond, konflik, rollback, retry, login dan isolasi tenant',{
 skip:process.env.MASTER_TRANSFER_ISOLATED!=='1'||process.env.INTEGRATION_DB!=='1',
},async()=>{
 requireDevelopment();
 const pool=createPool({timeout:30000}),db=await pool.connect();let auth,server,directory;
 const ids={owner:randomUUID(),a:randomUUID(),b:randomUUID(),property:randomUUID(),rooms:[randomUUID(),randomUUID()],devices:[randomUUID(),randomUUID(),randomUUID()],meters:[randomUUID(),randomUUID(),randomUUID()],assets:[randomUUID(),randomUUID(),randomUUID()]};
 const password=randomBytes(24).toString('hex'),hash=await hashPassword(password);
 let payload;
 const query=async(sql,args)=>(await db.query(sql,args)).rows;
 const readPlan=async data=>{
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try{return await planMasterPackage(db,data);}finally{await db.query('ROLLBACK');}
 };
 const reseal=changed=>{const {sha256,...body}=changed;return sealMasterPackage(body);};
 try{
  // Fixtures are created only on the explicitly isolated, disposable stack.
  for(const table of masterTables)assert.equal((await query(`SELECT count(*)::int AS n FROM ${table}`))[0].n,0,'isolated target must be empty');
  await db.query('BEGIN');
  for(const [id,role] of [[ids.owner,'owner'],[ids.a,'tenant'],[ids.b,'tenant']])
   await db.query('INSERT INTO users(id,name,email,password_hash,role) VALUES($1,$2,$3,$4,$5)',[id,'UJI TRANSFER',`${id}@test.invalid`,hash,role]);
  await db.query("INSERT INTO properties(id,owner_id,name,timezone) VALUES($1,$2,'UJI TRANSFER','Asia/Jakarta')",[ids.property,ids.owner]);
  for(let i=0;i<2;i++){
   await db.query("INSERT INTO rooms(id,property_id,code,name,active_from) VALUES($1,$2,$3,'UJI TRANSFER','2026-01-01Z')",[ids.rooms[i],ids.property,`TEST-${i}`]);
   const tenant=i===0?ids.a:ids.b;
   await db.query("INSERT INTO property_tenants(id,property_id,user_id,status) VALUES($1,$2,$3,'active')",[randomUUID(),ids.property,tenant]);
   await db.query("INSERT INTO occupancies(id,user_id,room_id,starts_at) VALUES($1,$2,$3,'2026-02-01T00:00:00.123456Z')",[randomUUID(),tenant,ids.rooms[i]]);
  }
  await db.query("INSERT INTO occupancies(id,user_id,room_id,starts_at,ends_at) VALUES($1,$2,$3,'2026-01-01T00:00:00.000001Z','2026-02-01T00:00:00.123456Z')",[randomUUID(),ids.a,ids.rooms[0]]);
  for(let i=0;i<3;i++){
   await db.query("INSERT INTO devices(id,property_id,device_uid,status,last_seen_at) VALUES($1,$2,$3,'active',now())",[ids.devices[i],ids.property,`transfer-${ids.devices[i]}`]);
   await db.query("INSERT INTO meter_assets(id,property_id,label) VALUES($1,$2,'UJI TRANSFER')",[ids.assets[i],ids.property]);
   await db.query("INSERT INTO meters(id,property_id,device_id,room_id,kind,channel_no,meter_asset_id,installed_at) VALUES($1,$2,$3,$4,$5,1,$6,'2026-02-01T00:00:00.123457Z')",[ids.meters[i],ids.property,ids.devices[i],ids.rooms[i]||null,i===2?'main':'room',ids.assets[i]]);
  }
  await db.query("INSERT INTO meters(id,property_id,device_id,kind,channel_no,meter_asset_id,installed_at,retired_at) VALUES($1,$2,$3,'main',1,$4,'2026-01-01Z','2026-02-01T00:00:00.123457Z')",[randomUUID(),ids.property,ids.devices[2],ids.assets[2]]);
  await db.query("INSERT INTO rooms(id,property_id,code,name,active_from,source) VALUES($1,$2,'SIM','SIMULATION TEST','2026-01-01Z','simulation')",[randomUUID(),ids.property]);
  await db.query("INSERT INTO meter_readings(meter_id,boot_id,sequence_no,counter_epoch,measured_at,energy_kwh,quality,data_source) VALUES($1,$2,0,0,'2026-10-01Z','10','valid','production')",[ids.meters[0],randomUUID()]);
  payload=await exportMasterPackage(db,ids.property);
  assert.deepEqual(Object.fromEntries(Object.entries(payload.data).map(([key,rows])=>[key,rows.length])),
   {properties:1,rooms:2,property_tenants:2,devices:3,communal_loads:0,meter_assets:3,meters:4,occupancies:3,users:3});
  assert.equal(payload.data.devices.every(row=>row.last_seen_at===null),true);
  assert.match(payload.data.occupancies.find(row=>row.ends_at===null).starts_at,/\.123456/);
  assert.match(payload.data.meters.find(row=>row.id===ids.meters[0]).installed_at,/\.123457/);
  assert.equal(Object.hasOwn(payload.data,'meter_readings'),false);
  await db.query('ROLLBACK');

  const before=await readPlan(payload);assert.equal(before.report.can_apply,true);
  assert.equal((await query('SELECT count(*)::int AS n FROM users'))[0].n,0,'plan is read-only');
  const applied=await applyMasterPackage(pool,payload,before.report.plan_sha256);
  assert.equal(applied.inserted.devices,3);
  assert.equal((await query('SELECT count(*)::int AS n FROM meter_readings'))[0].n,0,'telemetry never transferred');
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  assert.deepEqual((await exportMasterPackage(db,ids.property)).data,payload.data,'UUIDs, labels, dates, hashes and versions preserved');
  await db.query('ROLLBACK');

  // A real target reading must survive dry-run and repeated imports unchanged.
  await db.query("INSERT INTO meter_readings(meter_id,boot_id,sequence_no,counter_epoch,measured_at,energy_kwh,quality,data_source) VALUES($1,$2,0,0,'2026-10-02Z','12.345','valid','production')",[ids.meters[0],randomUUID()]);
  const reading=await query('SELECT to_jsonb(r) AS row FROM meter_readings r');
  await db.query("UPDATE devices SET last_seen_at='2026-10-02T01:02:03Z' WHERE id=$1",[ids.devices[0]]);
  const again=await readPlan(payload);assert.equal(again.report.can_apply,true);
  assert.equal(Object.values(again.report.insert_counts).reduce((a,b)=>a+b,0),0);
  await applyMasterPackage(pool,payload,again.report.plan_sha256);
  assert.deepEqual(await query('SELECT to_jsonb(r) AS row FROM meter_readings r'),reading);
  assert.equal((await query('SELECT last_seen_at FROM devices WHERE id=$1',[ids.devices[0]]))[0].last_seen_at.toISOString(),'2026-10-02T01:02:03.000Z','local device observation metadata is not overwritten');

  let changed=structuredClone(payload);changed.data.users[0].name='CHANGED';changed=reseal(changed);
  const conflict=await readPlan(changed);assert.equal(conflict.report.can_apply,false);
  assert.ok(conflict.report.conflicts.some(row=>row.reason==='existing_id_differs'&&row.fields.includes('name')));
  assert.ok(!JSON.stringify(conflict.report).includes(hash),'reports never contain password hashes');
  await assert.rejects(()=>applyMasterPackage(pool,changed,conflict.report.plan_sha256),/conflicts/);
  assert.deepEqual(await query('SELECT to_jsonb(r) AS row FROM meter_readings r'),reading);

  changed=structuredClone(payload);const oldDevice=changed.data.devices[0].id,newDevice=randomUUID();changed.data.devices[0].id=newDevice;
  for(const meter of changed.data.meters)if(meter.device_id===oldDevice)meter.device_id=newDevice;
  const identity=await readPlan(reseal(changed));assert.equal(identity.report.can_apply,false);
  assert.ok(identity.report.conflicts.some(row=>row.table==='devices'&&row.reason==='identity_or_interval_conflict'));

  changed=structuredClone(payload);const newTenant=randomUUID();changed.data.users.find(row=>row.id===ids.a).id=newTenant;
  for(const row of [...changed.data.property_tenants,...changed.data.occupancies])if(row.user_id===ids.a)row.user_id=newTenant;
  const emailConflict=await readPlan(reseal(changed));assert.equal(emailConflict.report.can_apply,false);
  assert.ok(emailConflict.report.conflicts.some(row=>row.table==='users'&&row.reason==='identity_or_interval_conflict'));

  changed=structuredClone(payload);changed.data.meters[0].id=randomUUID();
  assert.equal((await readPlan(reseal(changed))).report.can_apply,false,'overlapping installation refused');
  changed=structuredClone(payload);changed.data.occupancies[0].id=randomUUID();
  assert.equal((await readPlan(reseal(changed))).report.can_apply,false,'overlapping occupancy refused');
  changed=structuredClone(payload);changed.migrations[0].checksum='b'.repeat(64);
  assert.equal((await readPlan(reseal(changed))).report.schema_matches,false);
  changed=structuredClone(payload);changed.data.meters[0].device_id=randomUUID();
  assert.throws(()=>validateMasterPackage(reseal(changed)),/reference/);
  changed=structuredClone(payload);changed.data.rooms[0].source='simulation';
  assert.throws(()=>validateMasterPackage(reseal(changed)),/row|manual/);

  const stale=await readPlan(payload);
  await db.query('UPDATE users SET row_version=row_version+1 WHERE id=$1',[ids.owner]);
  await assert.rejects(()=>applyMasterPackage(pool,payload,stale.report.plan_sha256),/stale/);
  await db.query('UPDATE users SET row_version=row_version-1 WHERE id=$1',[ids.owner]);

  // An actual DB constraint failure after earlier inserts must roll everything back.
  changed=structuredClone(payload);
  const replacements=new Map(Object.values(changed.data).flat().map(row=>[row.id,randomUUID()]));
  changed.property_id=replacements.get(changed.property_id);
  for(const rows of Object.values(changed.data))for(const row of rows){
   for(const [key,value] of Object.entries(row))if(replacements.has(value))row[key]=replacements.get(value);
  }
  for(const user of changed.data.users)user.email=`${user.id}@test.invalid`;
  for(const device of changed.data.devices)device.device_uid=`transfer-${device.id}`;
  changed.data.properties[0].timezone='Invalid/Timezone';changed=reseal(changed);
  const invalid=await readPlan(changed);assert.equal(invalid.report.can_apply,true);
  await assert.rejects(()=>applyMasterPackage(pool,changed,invalid.report.plan_sha256),error=>error.code==='P0001');
  assert.equal((await query('SELECT count(*)::int AS n FROM users'))[0].n,3,'users inserted before rejected property are rolled back');
  assert.deepEqual(await query('SELECT to_jsonb(r) AS row FROM meter_readings r'),reading);

  // Exercise the actual file/CLI contract, including safe error output.
  directory=await mkdtemp(join(tmpdir(),'smartbilling-master-transfer-'));
  const input=join(directory,'master-private.json'),output=join(directory,'plan.json');
  await writeFile(input,JSON.stringify(payload),{mode:0o600});
  const run=(...args)=>spawnSync(process.execPath,['scripts/transfer-master.js',...args],{encoding:'utf8',timeout:15000});
  const inspect=run('inspect','--file',input);assert.equal(inspect.status,0);
  assert.equal(JSON.parse(inspect.stdout).counts.devices,3);assert.ok(!inspect.stdout.includes(hash));
  const planned=run('plan','--file',input,'--output',output);assert.equal(planned.status,0);
  const filePlan=JSON.parse(await readFile(output,'utf8'));assert.equal(filePlan.can_apply,true);
  assert.equal(run('apply','--file',input,'--plan-hash',filePlan.plan_sha256).status,0);
  const duplicateReport=run('plan','--file',input,'--output',output);assert.equal(duplicateReport.status,1,'existing output is not overwritten');
  assert.ok(!duplicateReport.stdout.includes(hash));
  const exported=join(directory,'exported.json');
  assert.equal(run('export','--property',ids.property,'--output',exported).status,0);
  assert.deepEqual(JSON.parse(await readFile(exported,'utf8')).data,payload.data);

  // Actual login and API scoping after import, using the original random fixture password.
  const app=express(),origin='http://127.0.0.1:3001';
  auth=authentication(pool,{secret:randomBytes(32).toString('hex'),origin,cookieName:'smartbilling.transfer.test'});
  app.use(auth.middleware);app.use('/api/auth',auth.router);app.use('/api',auth.requireUser,monitoringApi(pool));app.use(apiError);
  server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  for(const [user,room,meter,foreign] of [[ids.owner,null,null,null],[ids.a,ids.rooms[0],ids.meters[0],ids.meters[1]],[ids.b,ids.rooms[1],ids.meters[1],ids.meters[0]]]){
   let cookie='';
   const request=async(path,options={})=>{
    const response=await fetch(base+path,{...options,headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json',...options.headers}});
    if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];return response;
   };
   assert.equal((await request('/api/rooms')).status,401);
   const csrf=(await(await request('/api/auth/csrf')).json()).csrf;
   assert.equal((await request('/api/auth/login',{method:'POST',headers:{'x-csrf-token':csrf},body:JSON.stringify({email:`${user}@test.invalid`,password})})).status,200);
   const rooms=(await(await request('/api/rooms')).json()).data,meters=(await(await request('/api/meters')).json()).data;
   assert.equal(rooms.length,room?1:2);assert.equal(meters.length,meter?1:4);
   if(room){assert.equal(rooms[0].id,room);assert.equal(meters[0].id,meter);assert.equal((await request(`/api/meters/${foreign}/latest`)).status,404);assert.equal((await request(`/api/meters/${ids.meters[2]}/latest`)).status,404);}
  }
 }finally{
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  if(auth)await auth.store.close();
  await db.query('ROLLBACK').catch(()=>{});db.release();await pool.end();
  if(directory){
   assert.equal(dirname(resolve(directory)),resolve(tmpdir()));
   assert.ok(basename(directory).startsWith('smartbilling-master-transfer-'));
   await rm(directory,{recursive:true,force:true});
  }
 }
});
