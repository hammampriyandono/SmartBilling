import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {randomUUID,randomBytes} from 'node:crypto';
import {createPool,requireDevelopment} from '../src/connections.js';
import {authentication} from '../src/auth.js';
import {hashPassword,verifyPassword} from '../src/password.js';
import {monitoringApi,apiError} from '../src/monitoring-api.js';

test('password scrypt berversi: benar, salah, hash seed tidak dapat login',async()=>{
  await assert.rejects(()=>hashPassword('abc1234'),/8–1024 byte/);
  const minimumHash=await hashPassword('Abc12345');assert.equal(await verifyPassword('Abc12345',minimumHash),true);
  const password=randomBytes(24).toString('hex'), hash=await hashPassword(password);
  assert.equal(await verifyPassword(password,hash),true);
  assert.equal(await verifyPassword('incorrect',hash),false);
  assert.equal(await verifyPassword(password,'scrypt:old:seed'),false);
});

test('PostgreSQL auth: sesi, CSRF, isolasi owner/tenant, batas waktu, daily dan pagination',{
  skip:process.env.INTEGRATION_DB!=='1'?'Memerlukan INTEGRATION_DB=1':false,
},async()=>{
  requireDevelopment();const pool=createPool({timeout:10000}),db=await pool.connect();let server,auth;
  try {
    await db.query('BEGIN');
    const ids=Array.from({length:12},randomUUID),[owner,other,tenant,tenant2,property,property2,room,room2,device,device2,meter,meter2]=ids;
    const password=randomBytes(24).toString('hex'),hash=await hashPassword(password);
    for(const [id,role] of [[owner,'owner'],[other,'owner'],[tenant,'tenant'],[tenant2,'tenant']])
      await db.query('INSERT INTO users(id,name,email,password_hash,role) VALUES($1,$2,$3,$4,$5)',[id,'UJI AUTH',`${id}@test.invalid`,hash,role]);
    for(const [p,o,r,d,m] of [[property,owner,room,device,meter],[property2,other,room2,device2,meter2]]) {
      await db.query("INSERT INTO properties(id,owner_id,name,timezone) VALUES($1,$2,'UJI AUTH','Asia/Jakarta')",[p,o]);
      await db.query("INSERT INTO rooms(id,property_id,code,name,active_from) VALUES($1,$2,'AUTH','UJI AUTH','2026-01-01Z')",[r,p]);
      await db.query("INSERT INTO devices(id,property_id,device_uid,status) VALUES($1,$2,$3,'active')",[d,p,d]);
      await db.query("INSERT INTO meters(id,property_id,device_id,room_id,kind,channel_no,installed_at) VALUES($1,$2,$3,$4,'room',1,'2026-01-01Z')",[m,p,d,r]);
    }
    const occ=async(user,r,start,end)=>db.query('INSERT INTO occupancies(id,user_id,room_id,starts_at,ends_at) VALUES($1,$2,$3,$4,$5)',[randomUUID(),user,r,start,end]);
    await occ(tenant,room,'2026-09-11T17:01:00Z','2026-09-11T17:03:00Z');
    await occ(tenant,room,'2026-09-11T17:04:00Z','2026-09-11T17:06:00Z');
    await occ(tenant2,room,'2026-09-11T17:01:00Z','2026-09-11T17:03:00Z');
    await occ(tenant,room2,'2099-01-01T00:00:00Z',null);
    async function rejects(action,code) {
      await db.query('SAVEPOINT bad');await assert.rejects(action, e=>e.code===code);
      await db.query('ROLLBACK TO SAVEPOINT bad');await db.query('RELEASE SAVEPOINT bad');
    }
    await rejects(()=>occ(tenant,room2,'2026-09-11T17:02:00Z','2026-09-11T17:05:00Z'),'23P01');
    await rejects(()=>occ(owner,room,'2026-09-01Z',null),'P0001');
    await rejects(()=>occ(tenant2,room,'2025-01-01Z','2025-02-01Z'),'P0001');
    await rejects(()=>db.query("UPDATE users SET role='owner' WHERE id=$1",[tenant]),'P0001');
    await rejects(()=>db.query("UPDATE rooms SET active_until='2026-08-01Z' WHERE id=$1",[room]),'P0001');
    const boot=randomUUID();
    for(let i=0;i<8;i++) await db.query(`INSERT INTO meter_readings(meter_id,boot_id,sequence_no,counter_epoch,measured_at,energy_kwh,power_w,quality)
      VALUES($1,$2,$3,0,$4,$5,60,'valid')`,[meter,boot,i,new Date(Date.parse('2026-09-11T17:00:00Z')+i*60000),String(i)]);
    const app=express(),origin='http://127.0.0.1:3000';
    auth=authentication(db,{secret:randomBytes(48).toString('hex'),origin});
    app.use(auth.middleware);app.use('/api/auth',auth.router);app.use('/api',auth.requireUser,monitoringApi(db));app.use(apiError);
    server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
    const url=`http://127.0.0.1:${server.address().port}`;
    function browser() {
      let cookie='';
      return {get cookie(){return cookie;}, async request(path,{method='GET',body,csrf,originHeader=origin,headers={}}={}) {
        const response=await fetch(url+path,{method,headers:{Cookie:cookie,Origin:originHeader,...(body?{'Content-Type':'application/json'}:{}),...(csrf?{'X-CSRF-Token':csrf}:{}),...headers},body:body?JSON.stringify(body):undefined});
        if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
        return response;
      }};
    }
    async function login(client,id) {
      const csrf=(await (await client.request('/api/auth/csrf')).json()).csrf,old=client.cookie;
      const res=await client.request('/api/auth/login',{method:'POST',csrf,body:{email:`${id}@test.invalid`,password}});
      assert.equal(res.status,200);assert.notEqual(client.cookie,old);
      assert.match(res.headers.get('set-cookie'),/HttpOnly/);assert.match(res.headers.get('set-cookie'),/SameSite=Lax/);
    }
    const a=browser(),b=browser();
    assert.equal((await a.request('/api/rooms')).status,401);
    assert.equal((await a.request('/api/auth/login',{method:'POST',body:{email:'x',password}})).status,403);
    await login(a,owner);await login(b,tenant);
    for(const suffix of ['latest','readings?from=2026-09-11T00:00:00Z&to=2026-09-13T00:00:00Z','daily?from=2026-09-11&to=2026-09-13']) {
      assert.equal((await a.request(`/api/meters/${meter2}/${suffix}`)).status,404);
      assert.equal((await b.request(`/api/meters/${meter2}/${suffix}`)).status,404);
    }
    assert.equal((await fetch(url+'/api/rooms',{headers:{Cookie:'smartbilling.sid=invalid'}})).status,401);
    assert.deepEqual((await (await a.request(`/api/rooms?property_id=${property2}`)).json()).data,[]);
    assert.deepEqual((await (await b.request(`/api/rooms?property_id=${property2}`)).json()).data,[]);
    assert.equal((await (await b.request('/api/meters')).json()).data.length,1);
    const latest=await (await b.request(`/api/meters/${meter}/latest`)).json();assert.equal(latest.data.energy_kwh,'5.000000000');
    const path=`/api/meters/${meter}/readings?from=2026-09-11T00:00:00Z&to=2026-09-13T00:00:00Z&limit=1`;
    let cursor=null,rows=[];
    do {const data=await (await b.request(path+(cursor?`&cursor=${cursor}`:''))).json();rows.push(...data.data);cursor=data.next_cursor;}while(cursor);
    assert.deepEqual(rows.map(r=>Number(r.energy_kwh)),[1,2,4,5]);
    assert.notEqual(rows[1].access_segment,rows[2].access_segment);
    const forged=Buffer.from(JSON.stringify({measured_at:'2026-09-11T16:00:00Z',id:'1'})).toString('base64url');
    assert.equal((await (await b.request(path+`&cursor=${forged}`)).json()).data[0].energy_kwh,'1.000000000');
    const daily=await (await b.request(`/api/meters/${meter}/daily?from=2026-09-11&to=2026-09-13`)).json();
    assert.equal(daily.data.length,1);assert.equal(daily.data[0].sample_count,4);
    assert.equal(daily.data[0].consumption_kwh,null);assert.equal(daily.data[0].observed_consumption_kwh,'2.000000000');
    assert.equal(daily.data[0].coverage_seconds,120);
    assert.deepEqual((await (await b.request(`/api/meters/${meter}/daily?from=2026-09-10&to=2026-09-11`)).json()).data,[]);
    assert.equal((await b.request('/api/rooms',{headers:{'X-Account-ID':owner}})).status,401);
    const csrf=(await (await b.request('/api/auth/csrf')).json()).csrf;
    assert.equal((await b.request('/api/auth/logout',{method:'POST',csrf,originHeader:'http://evil.invalid'})).status,403);
    const savedCookie=b.cookie;
    assert.equal((await b.request('/api/auth/logout',{method:'POST',csrf})).status,204);
    assert.equal((await fetch(url+'/api/rooms',{headers:{Cookie:savedCookie}})).status,401);
    await login(b,tenant);
    await db.query('UPDATE users SET is_active=false WHERE id=$1',[tenant]);
    assert.equal((await b.request('/api/rooms')).status,401);
    await db.query("UPDATE auth_sessions SET sess=jsonb_set(sess::jsonb,'{expiresAt}','0')::json WHERE sess->>'userId'=$1",[owner]);
    assert.equal((await a.request('/api/rooms')).status,401);
    const c=browser(),token=(await (await c.request('/api/auth/csrf')).json()).csrf;
    for(let i=0;i<5;i++)assert.equal((await c.request('/api/auth/login',{method:'POST',csrf:token,body:{email:'absent@test.invalid',password:'wrong'}})).status,401);
    assert.equal((await c.request('/api/auth/login',{method:'POST',csrf:token,body:{email:'absent@test.invalid',password:'wrong'}})).status,429);
  } finally {
    if(server)await new Promise(r=>{server.closeAllConnections();server.close(r);});
    if(auth)await auth.store.close();await db.query('ROLLBACK');db.release();await pool.end();
  }
});
