import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {rfidReadiness} from '../src/rfid-readiness.js';
import {masterApi} from '../src/master-api.js';
import {apiError} from '../src/monitoring-api.js';
test('RFID readiness: scoped read-only mapping, no raw card or event data',async()=>{
 const calls=[];const db={async query(sql,args){assert.match(sql,/^SELECT/);calls.push({sql,args});return {rows:calls.length===1?[{id:'d',status:'active',source:'manual'}]:calls.length===2?[{reader_channel:0,is_active:true,load_type:'attributable',meter_installation_id:'m',meter_asset_id:'a',asset_status:'active'}]:[]};}};
 const result=await rfidReadiness(db,{ownerId:'owner',deviceUid:'esp32-reader'});assert.equal(result.ready,true);assert.deepEqual(calls[0].args,['esp32-reader','owner']);assert.equal(result.stream,null);assert.equal(JSON.stringify(result).includes('card_uid'),false);
});
test('RFID readiness: missing device and simulated/incomplete mapping',async()=>{
 assert.equal(await rfidReadiness({query:async()=>({rows:[]})},{ownerId:'o',deviceUid:'x'}),null);
 let n=0;const db={query:async()=>({rows:++n===1?[{id:'d',status:'inactive',source:'simulation'}]:n===2?[{reader_channel:1,is_active:false,source:'simulation',load_type:'shared'}]:[]})};
 const result=await rfidReadiness(db,{ownerId:'o',deviceUid:'x'});assert.equal(result.ready,false);assert.ok(result.issues.includes('simulation_device'));assert.ok(result.issues.includes('reader_1_missing_active_meter'));
});
test('RFID readiness HTTP: owner only; validation and absent scope are safe',async()=>{
 let role='owner';const pool={query:async()=>({rows:[]})};const app=express();app.use((req,_res,next)=>{req.user={id:'owner',role};next();});
 app.use('/api',masterApi(pool,{idempotencySecret:'rfid-readiness-test-secret-long-enough'}));app.use(apiError);
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 try{const base=`http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(base+'/api/owner/rfid-readiness?device_uid=unknown')).status,404);
  assert.equal((await fetch(base+'/api/owner/rfid-readiness?device_uid=bad%2Fuid')).status,400);
  role='tenant';assert.equal((await fetch(base+'/api/owner/rfid-readiness?device_uid=unknown')).status,403);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
