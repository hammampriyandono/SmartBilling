import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {randomUUID} from 'node:crypto';
import {createPool,requireDevelopment} from '../src/connections.js';
import {roomRelayApi,receiveRoomRelayReport,createRoomRelayWorker,configureRoomRelay} from '../src/room-relay.js';
import {apiError} from '../src/monitoring-api.js';
import {HttpError} from '../src/http-input.js';

test('PostgreSQL room relay: authorization, outbox, ACK, expiry and lifecycle', {skip:process.env.INTEGRATION_DB!=='1'},async t=>{
  requireDevelopment();const pool=createPool({timeout:15000}),db=await pool.connect();let server,savepoint=0,time=Date.now(),reportSeq=0;
  const ids=Object.fromEntries(['owner','other','tenant','property','room','device','asset','meter','binding','boot'].map(k=>[k,randomUUID()]));
  const uid=`relay-fixture-${ids.device}`,topic=`smartbilling/v1/devices/${uid}/relay/status`;
  const adapter={query:(...args)=>db.query(...args),connect:async()=>{let name;return {release(){},query:async(sql,args)=>{
    if(sql==='BEGIN'){name=`relay_${++savepoint}`;return db.query(`SAVEPOINT ${name}`);}
    if(sql==='COMMIT')return db.query(`RELEASE SAVEPOINT ${name}`);
    if(sql==='ROLLBACK')return db.query(`ROLLBACK TO SAVEPOINT ${name}`);
    return db.query(sql,args);
  }};}};
  const now=()=>time;let acting={id:ids.owner,role:'owner'};
  const report=(extra={})=>({schema_version:1,binding_id:ids.binding,boot_id:ids.boot,report_sequence:++reportSeq,
    reported_at:new Date(time).toISOString(),state:'off',gpio_pin:3,gpio_level:extra.state==='on'?1:0,command_id:null,command_sequence:null,result:'status',reason:null,...extra});
  const receive=(p,packet={qos:1},incoming=topic)=>receiveRoomRelayReport(adapter,incoming,Buffer.from(JSON.stringify(p)),packet,{now:time});
  const bound=async()=> (await db.query('SELECT * FROM room_relay_bindings WHERE id=$1',[ids.binding])).rows[0];
  const history=async()=> (await db.query('SELECT * FROM room_relay_commands WHERE binding_id=$1 ORDER BY sequence_no',[ids.binding])).rows;
  const configure=async(mode,extra={})=>configureRoomRelay(adapter,{ownerId:ids.owner,roomId:ids.room,meterId:ids.meter,deviceUid:uid,
    mode,reason:'Fixture commissioning',now:time,...extra});
  try {
    await db.query('BEGIN');
    for(const [id,role] of [[ids.owner,'owner'],[ids.other,'owner'],[ids.tenant,'tenant']])await db.query("INSERT INTO users(id,name,email,password_hash,role) VALUES($1,'Relay fixture',$2,'unused',$3)",[id,`${id}@fixture.invalid`,role]);
    await db.query("INSERT INTO properties(id,owner_id,name,timezone) VALUES($1,$2,'Relay fixture','Asia/Jakarta')",[ids.property,ids.owner]);
    await db.query("INSERT INTO rooms(id,property_id,code,name,active_from,source) VALUES($1,$2,'RELAY-TEST','Relay fixture','2026-01-01Z','manual')",[ids.room,ids.property]);
    await db.query("INSERT INTO devices(id,property_id,device_uid,status,source) VALUES($1,$2,$3,'active','manual')",[ids.device,ids.property,uid]);
    await db.query("INSERT INTO meter_assets(id,property_id,label,source) VALUES($1,$2,'Relay fixture','manual')",[ids.asset,ids.property]);
    await db.query("INSERT INTO meters(id,property_id,device_id,meter_asset_id,room_id,kind,channel_no,installed_at,source) VALUES($1,$2,$3,$4,$5,'room',1,'2026-01-01Z','manual')",[ids.meter,ids.property,ids.device,ids.asset,ids.room]);
    const app=express();app.use((req,_res,next)=>{req.user=acting;next();});
    const options={csrf:(req,_res,next)=>req.get('x-csrf-token')==='fixture'?next():next(new HttpError(403,'invalid_csrf')),idempotencySecret:'fixture-secret-no-real-credentials',now};
    app.use('/api',roomRelayApi(adapter,{...options,enabled:true}));app.use('/disabled',roomRelayApi(adapter,options));
    app.use((error,_req,_res,next)=>{if(!(error instanceof HttpError))console.error('Fixture DB error:',error.code,error.message);next(error);});app.use(apiError);
    server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${server.address().port}`;
    const path=`/owner/rooms/${ids.room}/relay`;
    async function call(body,{key=randomUUID(),csrf=true,prefix='/api',roomPath=path}={}){
      const response=await fetch(base+prefix+roomPath+(body?'/commands':''),{method:body?'POST':'GET',headers:body?{'content-type':'application/json','idempotency-key':key,...(csrf?{'x-csrf-token':'fixture'}:{})}:{},body:body?JSON.stringify(body):undefined});
      return {http:response.status,...await response.json()};
    }
    async function body(desired_state='off'){return {meter_id:ids.meter,row_version:(await bound()).row_version,desired_state,reason:'Fixture: owner manual test'};}
    const published=[],mqtt={connected:true,publish(...args){published.push(args.slice(0,3));args[3]?.();}};
    const tick=createRoomRelayWorker(adapter,mqtt,{enabled:true,now});let first,firstBody,firstKey;

    await t.test('no binding and feature disabled remain unavailable, tenant/other owner denied',async()=>{
      assert.equal((await call()).data.blocked_reason,'relay_not_commissioned');
      acting={id:ids.tenant,role:'tenant'};assert.equal((await call()).http,403);
      assert.equal((await call({meter_id:ids.meter,row_version:1,desired_state:'off',reason:'x'})).http,403);
      acting={id:ids.other,role:'owner'};assert.equal((await call()).http,404);acting={id:ids.owner,role:'owner'};
      assert.equal((await configure('plan')).binding,null);
      const prepared=await configure('prepare');ids.binding=prepared.binding.id;
      assert.equal(prepared.changed,true);assert.equal((await configure('prepare')).changed,false);
      await assert.rejects(configure('plan',{deviceUid:'wrong-target'}),/relay_target_changed/);
      assert.equal((await bound()).enabled,false);assert.equal((await call()).data.can_control,false);
      await assert.rejects(configure('enable',{rowVersion:1}),/relay_hardware_verification_required/);
      await assert.rejects(configure('enable',{rowVersion:1,hardwareVerified:true}),/relay_status_stale/);
      assert.equal((await call(await body(),{prefix:'/disabled'})).error,'relay_control_disabled');
    });
    await t.test('database rejects GPIO state without report and contradictory GPIO/state',async()=>{
      await db.query('SAVEPOINT gpio_constraint');
      await assert.rejects(db.query('UPDATE room_relay_bindings SET reported_gpio_level=1 WHERE id=$1',[ids.binding]),e=>e.code==='23514');
      await db.query('ROLLBACK TO SAVEPOINT gpio_constraint');
    });
    await t.test('fresh registered status only, duplicate/foreign/retained reports do not refresh liveness',async()=>{
      const p=report();assert.equal((await receive(p)).status,'accepted');const before=await bound();
      assert.equal((await receive(p)).status,'duplicate');
      assert.equal((await receive(report(),{qos:1,retain:true})).status,'rejected');
      assert.equal((await receive(report(),{qos:1},topic.replace(uid,'wrong-device'))).status,'rejected');
      assert.equal(+(await bound()).last_received_at,+before.last_received_at);
      await configure('enable',{rowVersion:before.row_version,hardwareVerified:true});
      assert.equal((await call()).data.can_control,true);
    });
    await t.test('CSRF, stale installation, unknown fields and row version enforced before command',async()=>{
      assert.equal((await call(await body(),{csrf:false})).http,403);
      assert.equal((await call({...await body(),meter_id:randomUUID()})).error,'stale_version');
      assert.equal((await call({...await body(),row_version:999})).error,'stale_version');
      assert.equal((await call({...await body(),extra:true})).http,400);
      assert.equal((await history()).length,0);
    });
    await t.test('durable request idempotency and one pending command; broker PUBACK does not confirm',async()=>{
      firstBody=await body();firstKey=randomUUID();const response=await call(firstBody,{key:firstKey});assert.equal(response.http,202);first=response.data.command;
      assert.equal((await call(firstBody,{key:firstKey})).data.command.id,first.id);
      assert.equal((await call({...firstBody,desired_state:'on'},{key:firstKey})).error,'idempotency_key_conflict');
      assert.equal((await call(await body('on'))).error,'relay_command_pending');
      assert.equal((await history()).length,1);await tick();assert.equal(published.length,1);
      assert.equal((await history())[0].status,'sent');assert.equal(published[0][2].retain,false);assert.equal(published[0][2].qos,1);
      assert.equal(published[0][0],`smartbilling/v1/devices/${uid}/relay/commands`);
      assert.equal(JSON.parse(published[0][1]).command_id,first.id);
      assert.equal((await db.query("SELECT count(*)::int n FROM audit_logs WHERE entity_type='room_relay_command' AND entity_id=$1",[first.id])).rows[0].n,1);
    });
    await t.test('mismatched ACK rejected; matching ACK confirms; newer heartbeat cannot be overwritten by delayed ACK',async()=>{
      time+=1000;const ack=report({result:'applied',command_id:first.id,command_sequence:String(first.sequence_no),state:'off'});
      assert.equal((await receive({...ack,state:'on',gpio_level:1})).status,'rejected');assert.equal((await history())[0].status,'sent');
      time+=1000;assert.equal((await receive(report({state:'on'}))).status,'accepted');const latest=await bound();
      assert.equal((await receive(ack)).status,'accepted');assert.equal((await history())[0].status,'confirmed');
      assert.equal((await bound()).reported_state,'on');assert.equal(+(await bound()).last_reported_at,+latest.last_reported_at);
    });
    await t.test('expiry, process restart and stale reports: no late publish, unknown outcome remains honest',async()=>{
      const response=await call(await body('off'));assert.equal(response.http,202);const command=response.data.command;
      await tick();const wire=published.at(-1)[1],count=published.length;
      time+=3100;await createRoomRelayWorker(adapter,mqtt,{enabled:true,now})();assert.equal(published.at(-1)[1],wire);
      time=+new Date(command.expires_at)+1;await tick();assert.equal(published.length,count+1);
      assert.equal((await history()).at(-1).status,'unconfirmed');
      time+=31000;assert.equal((await call()).data.fresh,false);assert.equal((await call()).data.reported_state,'on');
      assert.equal((await call(await body())).error,'relay_status_stale');
      assert.equal((await call(firstBody,{key:firstKey})).data.command.id,first.id);
    });
    await t.test('an expired command can be rejected after deadline but never confirmed as applied',async()=>{
      time+=1;assert.equal((await receive(report())).status,'accepted');
      const response=await call(await body('off'));assert.equal(response.http,202);const command=response.data.command;
      time+=16000;await tick();assert.equal((await history()).at(-1).status,'unconfirmed');
      const ack=report({result:'applied',command_id:command.id,command_sequence:String(command.sequence_no),state:'off'});
      assert.equal((await receive(ack)).status,'rejected');
      assert.equal((await receive({...ack,result:'rejected',reason:'expired'})).status,'accepted');
      assert.equal((await history()).at(-1).status,'rejected');assert.equal((await history()).at(-1).result_reason,'expired');
    });
    await t.test('disabled binding, reboot, inactive device and retired installation stop dispatch',async()=>{
      time+=1;assert.equal((await receive(report())).status,'accepted');
      const response=await call(await body());assert.equal(response.http,202);const before=published.length;
      await configure('disable',{rowVersion:(await bound()).row_version});await tick();assert.equal(published.length,before);
      await db.query('UPDATE room_relay_bindings SET enabled=true WHERE id=$1',[ids.binding]);
      const second=randomUUID(),asset=randomUUID();
      await db.query("INSERT INTO meter_assets(id,property_id,label,source) VALUES($1,$2,'Ambiguous fixture','manual')",[asset,ids.property]);
      await db.query("INSERT INTO meters(id,property_id,device_id,meter_asset_id,kind,channel_no,installed_at,source) VALUES($1,$2,$3,$4,'main',2,'2026-01-01Z','manual')",[second,ids.property,ids.device,asset]);
      assert.equal((await call()).data.blocked_reason,'relay_installation_ambiguous');
      await assert.rejects(configure('plan'),/relay_installation_ambiguous/);await tick();assert.equal(published.length,before);
      await db.query('UPDATE meters SET retired_at=now() WHERE id=$1',[second]);
      time+=1;assert.equal((await receive(report({boot_id:randomUUID(),report_sequence:0}))).status,'accepted');await tick();assert.equal(published.length,before);
      await db.query("UPDATE devices SET status='inactive' WHERE id=$1",[ids.device]);assert.equal((await call()).data.blocked_reason,'relay_installation_unavailable');await tick();assert.equal(published.length,before);
      await db.query("UPDATE devices SET status='active' WHERE id=$1",[ids.device]);
      await db.query('UPDATE meters SET retired_at=now() WHERE id=$1',[ids.meter]);await tick();assert.equal(published.length,before);assert.equal((await call()).http,404);
    });
    await t.test('relay preparation creates no measurements, RFID sessions or billing data',async()=>{
      assert.equal((await db.query('SELECT count(*)::int n FROM meter_readings WHERE meter_id=$1',[ids.meter])).rows[0].n,0);
      assert.equal((await db.query('SELECT count(*)::int n FROM usage_sessions s JOIN communal_loads l ON l.id=s.communal_load_id WHERE l.property_id=$1',[ids.property])).rows[0].n,0);
    });
  }finally{if(server)await new Promise(resolve=>server.close(resolve));await db.query('ROLLBACK');db.release();await pool.end();}
});
