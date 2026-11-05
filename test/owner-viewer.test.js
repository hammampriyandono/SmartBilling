import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {randomUUID,randomBytes} from 'node:crypto';
import {ownerViewerAccess} from '../src/owner-viewer.js';
import {authentication} from '../src/auth.js';
import {hashPassword} from '../src/password.js';
import {createPool,requireDevelopment} from '../src/connections.js';
import {monitoringApi,apiError} from '../src/monitoring-api.js';
import {masterApi} from '../src/master-api.js';
import {billingApi} from '../src/billing-api.js';
import {tokenApi} from '../src/token-api.js';
import {rfidApi} from '../src/rfid-api.js';
import {rfidDiagnosticsApi} from '../src/rfid-status.js';
import {deviceHealthApi} from '../src/device-health-api.js';
import {roomRelayApi} from '../src/room-relay.js';

test('viewer fail closed: mutasi semua metode dan endpoint baru ditolak sebelum handler',()=>{
  const user={id:randomUUID(),role:'viewer'},owner=randomUUID();
  for(const method of ['POST','PATCH','PUT','DELETE','OPTIONS','CONNECT'])for(const path of ['/owner/rooms','/owner/new-action','/rooms']) {
    let error;const req={user,viewerGrant:{owner_id:owner},method,path};
    ownerViewerAccess(req,null,e=>{error=e;});assert.equal(error.status,403);assert.equal(error.message,'viewer_read_only');assert.equal(req.user,user);
  }
  for(const path of ['/owner/new-action','/auth/activate','/owner/rooms/x/relay/commands','/owner/billing-periods/../../rooms']) {
    ownerViewerAccess({user,viewerGrant:{owner_id:owner},method:'GET',path},null,e=>assert.equal(e.status,403));
  }
  for(const role of ['owner','tenant'])ownerViewerAccess({user:{role}},null,e=>assert.equal(e,undefined));
  ownerViewerAccess({user,method:'GET',path:'/rooms'},null,e=>assert.equal(e.status,403));
});

test('PostgreSQL viewer: semua halaman owner, isolasi properti, blok mutasi, expiry dan pencabutan',{
  skip:process.env.INTEGRATION_DB!=='1'?'Memerlukan PostgreSQL terisolasi':false,
},async()=>{
  requireDevelopment();const pool=createPool({timeout:10000}),db=await pool.connect();let server,auth;
  try {
    await db.query('BEGIN');
    const [owner,other,viewer,property,foreignProperty,room,foreignRoom,device,foreignDevice,meter,foreignMeter,period]=Array.from({length:12},randomUUID);
    const password=randomBytes(24).toString('hex'),hash=await hashPassword(password),secret=randomBytes(40).toString('hex');
    for(const [id,role] of [[owner,'owner'],[other,'owner'],[viewer,'viewer']])await db.query(
      'INSERT INTO users(id,name,email,password_hash,role) VALUES($1,$2,$3,$4,$5)',[id,'UJI VIEWER',`${id}@test.invalid`,hash,role]);
    await db.query("INSERT INTO owner_viewers(user_id,owner_id,expires_at) VALUES($1,$2,now()+interval '2 days')",[viewer,owner]);
    for(const [p,o,r,d,m] of [[property,owner,room,device,meter],[foreignProperty,other,foreignRoom,foreignDevice,foreignMeter]]) {
      await db.query("INSERT INTO properties(id,owner_id,name,timezone) VALUES($1,$2,'UJI VIEWER','Asia/Jakarta')",[p,o]);
      await db.query("INSERT INTO rooms(id,property_id,code,name,active_from) VALUES($1,$2,'EXPO','UJI VIEWER','2026-01-01Z')",[r,p]);
      await db.query("INSERT INTO devices(id,property_id,device_uid,status) VALUES($1,$2,$3,'active')",[d,p,d]);
      await db.query("INSERT INTO meters(id,property_id,device_id,room_id,kind,channel_no,installed_at) VALUES($1,$2,$3,$4,'room',1,'2026-01-01Z')",[m,p,d,r]);
    }
    await db.query(`INSERT INTO billing_periods(id,property_id,starts_at,ends_at,revision_no,revision_kind,source,calculation_version,policy_snapshot,created_by)
      VALUES($1,$2,'2026-11-04Z','2026-11-05Z',1,'initial','production','billing-v2','{}',$3)`,[period,property,owner]);
    await db.query(`INSERT INTO meter_readings(meter_id,boot_id,sequence_no,counter_epoch,measured_at,energy_kwh,power_w,quality,data_source)
      VALUES($1,$2,0,0,'2026-11-04T00:00:00Z',0.125,12,'valid','production')`,[meter,randomUUID()]);
    const before=(await db.query('SELECT row_to_json(r) data FROM meter_readings r WHERE meter_id=$1',[meter])).rows;
    const app=express(),origin='http://127.0.0.1:3000';
    auth=authentication(db,{secret,origin});app.use(auth.middleware);app.use('/api/auth',auth.router);
    app.use('/api',auth.requireUser,ownerViewerAccess);
    const options={csrf:auth.csrf,idempotencySecret:secret};
    for(const router of [roomRelayApi(db,options),billingApi(db,options),tokenApi(db,options),deviceHealthApi(db,options),masterApi(db,options),rfidApi(db),rfidDiagnosticsApi(db),monitoringApi(db)])app.use('/api',router);
    app.use(apiError);server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
    const url=`http://127.0.0.1:${server.address().port}`;let cookie='';
    async function request(path,{method='GET',body,csrf,account=viewer}={}) {
      const response=await fetch(url+path,{method,headers:{Origin:origin,Cookie:cookie,'X-Account-ID':account,
        'Content-Type':'application/json','Idempotency-Key':randomUUID(),...(csrf?{'X-CSRF-Token':csrf}:{})},body:body?JSON.stringify(body):undefined});
      if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];return response;
    }
    let csrf=(await (await request('/api/auth/csrf')).json()).csrf;
    assert.equal((await request('/api/auth/login',{method:'POST',csrf,body:{email:`${viewer}@test.invalid`,password}})).status,200);
    const me=await (await request('/api/auth/me')).json();assert.equal(me.user.id,viewer);assert.equal(me.user.role,'viewer');assert.equal(me.user.read_only,true);assert.equal(me.user.dashboard_role,'owner');
    csrf=(await (await request('/api/auth/csrf')).json()).csrf;
    const paths=['/rooms','/meters','/facilities','/usage-sessions?from=2026-11-04T00:00:00Z&to=2026-11-05T00:00:00Z','/owner/properties','/owner/rooms','/owner/tenants','/owner/occupancies','/owner/rfid-cards','/owner/facilities','/owner/devices','/owner/meter-assets','/owner/meter-installations','/owner/readers','/owner/rfid-devices','/owner/device-health','/owner/billing-periods','/owner/bill-shares','/owner/reports/billing',
      `/owner/billing-periods/${period}`,`/owner/billing-periods/${period}/observed-usage`,
      `/owner/tariff-schedules?property_id=${property}`,`/owner/meter-comparison?property_id=${property}`,
      `/owner/token-purchases?property_id=${property}&month=2026-11`,`/owner/monthly-token-summary?property_id=${property}&month=2026-11`,
      `/owner/rooms/${room}/relay`,`/meters/${meter}/latest`,`/meters/${meter}/readings?from=2026-11-04T00:00:00Z&to=2026-11-05T00:00:00Z`,`/meters/${meter}/daily?from=2026-11-04&to=2026-11-05`];
    for(const path of paths){const response=await request('/api'+path);assert.equal(response.status,200,`${path}: ${await response.text()}`);}
    assert.equal((await (await request('/api/owner/properties')).json()).data.length,1);
    assert.equal((await (await request(`/api/meters/${meter}/latest`)).json()).data.energy_kwh,'0.125000000');
    assert.equal((await (await request(`/api/owner/rooms/${room}/relay`)).json()).data.can_control,false);
    assert.deepEqual((await (await request(`/api/rooms?property_id=${foreignProperty}`)).json()).data,[]);
    for(const path of [`/meters/${foreignMeter}/latest`,`/owner/rooms/${foreignRoom}/relay`,`/owner/meter-comparison?property_id=${foreignProperty}`])assert.equal((await request('/api'+path)).status,404,path);
    assert.equal((await request('/api/owner/properties',{account:owner})).status,401);
    for(const method of ['POST','PATCH','PUT','DELETE'])for(const path of ['/owner/rooms',`/owner/rooms/${room}`,`/owner/rooms/${room}/relay/commands`,`/owner/billing-periods/${period}/finalize`,'/owner/token-purchases','/owner/device-health/alerts/review','/auth/activate']) {
      const response=await request('/api'+path,{method,csrf,body:{owner_id:other,role:'owner',read_only:false}});
      assert.equal(response.status,403,`${method} ${path}`);
    }
    assert.equal((await request('/api/owner/new-future-action')).status,403);
    assert.deepEqual((await db.query('SELECT row_to_json(r) data FROM meter_readings r WHERE meter_id=$1',[meter])).rows,before);
    assert.equal((await db.query('SELECT count(*)::int n FROM room_relay_commands')).rows[0].n,0);
    const invalid=async(sql,args)=>{await db.query('SAVEPOINT invalid');await assert.rejects(()=>db.query(sql,args));await db.query('ROLLBACK TO SAVEPOINT invalid');};
    await invalid("UPDATE users SET role='owner' WHERE id=$1",[viewer]);
    await invalid('UPDATE owner_viewers SET owner_id=$2 WHERE user_id=$1',[viewer,other]);
    await invalid('INSERT INTO owner_viewers(user_id,owner_id,expires_at) VALUES($1,$2,now())',[owner,other]);
    await db.query("UPDATE owner_viewers SET expires_at=now()-interval '1 second' WHERE user_id=$1",[viewer]);
    assert.equal((await request('/api/owner/properties')).status,401);assert.equal((await request('/api/auth/me')).status,401);
    await db.query("UPDATE owner_viewers SET expires_at=now()+interval '1 day',revoked_at=now() WHERE user_id=$1",[viewer]);
    assert.equal((await request('/api/rooms')).status,401);
    assert.equal((await request('/api/auth/logout',{method:'POST',csrf})).status,204);
    csrf=(await (await request('/api/auth/csrf')).json()).csrf;
    assert.equal((await request('/api/auth/login',{method:'POST',csrf,body:{email:`${viewer}@test.invalid`,password}})).status,403);
  }finally {
    if(server)await new Promise(r=>{server.closeAllConnections();server.close(r);});
    if(auth)await auth.store.close();await db.query('ROLLBACK');db.release();await pool.end();
  }
});
