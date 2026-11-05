import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {randomBytes,randomUUID} from 'node:crypto';
import {authentication} from '../src/auth.js';
import {apiError} from '../src/monitoring-api.js';
import {hashPassword} from '../src/password.js';
import {createPool,requireDevelopment} from '../src/connections.js';

test('PostgreSQL idle: 15 menit semua role, polling/CSRF tidak renew, aktivitas atomik dan expiry tetap',{
  skip:process.env.INTEGRATION_DB!=='1'?'Memerlukan PostgreSQL terisolasi':false,
},async()=>{
  requireDevelopment();const pool=createPool({timeout:10000}),db=await pool.connect();let auth,server;
  try {
    await db.query('BEGIN');
    const ids={owner:randomUUID(),tenant:randomUUID(),viewer:randomUUID()},password=randomBytes(20).toString('hex'),hash=await hashPassword(password);
    for(const [role,id]of Object.entries(ids))await db.query('INSERT INTO users(id,name,email,password_hash,role) VALUES($1,$2,$3,$4,$5)',[id,'UJI IDLE',`${id}@test.invalid`,hash,role]);
    await db.query("INSERT INTO owner_viewers(user_id,owner_id,expires_at) VALUES($1,$2,now()+interval '2 days')",[ids.viewer,ids.owner]);
    let now=Date.now();const idle=15*60000,origin='http://127.0.0.1:3000';auth=authentication(db,{secret:randomBytes(40).toString('hex'),origin,clock:()=>now});
    const app=express();app.use(auth.middleware);app.use('/api/auth',auth.router);app.get('/api/private',auth.requireUser,(_req,res)=>res.json({ok:true}));app.use(apiError);
    server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const url=`http://127.0.0.1:${server.address().port}`;
    function browser(id){let cookie='',csrf;return {async request(path,method='GET',body,extra={}){
      const r=await fetch(url+path,{method,headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json','X-CSRF-Token':csrf||'','X-Account-ID':id,...extra},body:body?JSON.stringify(body):undefined});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return r;
    },async login(){csrf=(await(await this.request('/api/auth/csrf')).json()).csrf;assert.equal((await this.request('/api/auth/login','POST',{email:`${id}@test.invalid`,password})).status,200);csrf=(await(await this.request('/api/auth/csrf')).json()).csrf;},async me(){const r=await this.request('/api/auth/me');assert.equal(r.status,200);return r.json();}};}
    for(const [role,id]of Object.entries(ids)) {
      const b=browser(id);await b.login();const initial=(await b.me()).session;
      assert.equal(initial.idle_timeout_ms,idle);assert.equal(initial.idle_expires_at,initial.last_activity_at+idle);
      now+=idle-1;
      assert.equal((await b.request('/api/private')).status,200);
      assert.equal((await b.request('/api/auth/csrf')).status,200);
      assert.equal((await b.me()).session.last_activity_at,initial.last_activity_at,role);
      now++;
      assert.equal((await b.request('/api/private')).status,401,role);
      const expired=await b.request('/api/auth/me');assert.equal((await expired.json()).error,'session_idle_expired');
      assert.equal((await b.request('/api/auth/activity','POST',{})).status,401,'heartbeat cannot revive expired session');
    }
    const b=browser(ids.owner);await b.login();const initial=(await b.me()).session;
    now+=600000;
    assert.equal((await b.request('/api/auth/activity','POST',{}, {'X-CSRF-Token':'wrong'})).status,403);
    assert.equal((await b.request('/api/auth/activity','POST',{}, {'X-Account-ID':ids.tenant})).status,401);
    for(const body of [{age_ms:-1},{age_ms:60001},{age_ms:1.5},{lastActivityAt:now}])assert.equal((await b.request('/api/auth/activity','POST',body)).status,400);
    const activity=await b.request('/api/auth/activity','POST',{age_ms:10000});assert.equal(activity.status,200);
    const updated=(await activity.json()).session;assert.equal(updated.last_activity_at,now-10000);assert.equal(updated.expires_at,initial.expires_at);
    // A delayed activity can never move lastActivityAt backwards.
    const delayed=await b.request('/api/auth/activity','POST',{age_ms:60000});assert.equal((await delayed.json()).session.last_activity_at,updated.last_activity_at);
    now=initial.last_activity_at+idle;assert.equal((await b.request('/api/private')).status,200,'human activity extended idle deadline');
    now=updated.last_activity_at+idle;assert.equal((await b.request('/api/private')).status,401);
    await b.login();
    // Existing sessions without the new field use issuedAt, never the first poll.
    await db.query("UPDATE auth_sessions SET sess=(sess::jsonb-'lastActivityAt')::json WHERE sess->>'userId'=$1",[ids.owner]);
    const legacy=(await b.me()).session;assert.equal(legacy.last_activity_at,legacy.issued_at);
    now+=idle;assert.equal((await b.request('/api/private')).status,401);
    await b.login();const hard=(await b.me()).session;
    await db.query("UPDATE auth_sessions SET sess=jsonb_set(sess::jsonb,'{lastActivityAt}',to_jsonb($2::double precision))::json WHERE sess->>'userId'=$1",[ids.owner,hard.expires_at-1]);
    now=hard.expires_at;assert.equal((await b.request('/api/auth/activity','POST',{})).status,401,'absolute eight-hour limit remains');
    await b.login();assert.equal((await b.request('/api/auth/logout','POST',{})).status,204);
    assert.equal((await b.request('/api/auth/activity','POST',{})).status,403,'deleted session cannot be recreated by heartbeat');
  }finally{
    if(server)await new Promise(r=>{server.closeAllConnections();server.close(r);});
    if(auth)await auth.store.close();await db.query('ROLLBACK');db.release();await pool.end();
  }
});
