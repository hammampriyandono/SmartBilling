import test from 'node:test';
import assert from 'node:assert/strict';
import {deviceReadiness} from '../src/hardware-readiness.js';
import express from 'express';
import {randomUUID} from 'node:crypto';
import {masterApi} from '../src/master-api.js';
import {apiError} from '../src/monitoring-api.js';

test('readiness merangkum mapping device, aset dan installation tanpa mutasi',async()=>{
 const calls=[],db={async query(sql){calls.push(sql);return calls.length===1?{rows:[{id:'d',property_id:'p',device_uid:'esp32-01',status:'active'}]}:{rows:[{id:'m',channel_no:1,kind:'room',meter_asset_id:'a',meter_asset_label:'Meter 1',asset_retired_at:null}]};}};
 const result=await deviceReadiness(db,{ownerId:'o',deviceUid:'esp32-01',at:'2026-09-24T00:00:00Z'});assert.equal(result.ready,true);assert.equal(result.installations[0].channel_no,1);assert.ok(calls.every(sql=>/^SELECT/.test(sql.trim())));
});
test('readiness menandai device nonaktif dan installation/aset yang belum siap',async()=>{
 let n=0,db={async query(){return ++n===1?{rows:[{id:'d',status:'inactive'}]}:{rows:[]};}};const result=await deviceReadiness(db,{ownerId:'o',deviceUid:'x'});assert.deepEqual(result.issues,['inactive_device','no_active_installation']);assert.equal(result.ready,false);
});
test('endpoint readiness hanya owner dan tidak melakukan mutasi',async()=>{
 const owner=randomUUID();let role='owner',n=0;const pool={async query(sql){assert.match(sql,/^SELECT/);return ++n===1?{rows:[{id:'d',property_id:'p',device_uid:'esp32-01',status:'active'}]}:{rows:[{id:'m',channel_no:0,meter_asset_id:'a',asset_retired_at:null}]};}};
 const app=express();app.use((req,_res,next)=>{req.user={id:owner,role};next();});app.use('/api',masterApi(pool,{csrf:(_q,_s,next)=>next(),idempotencySecret:'hardware-readiness-test-secret-0123456789'}));app.use(apiError);const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 try{const base=`http://127.0.0.1:${server.address().port}`;let response=await fetch(`${base}/api/owner/hardware-readiness?device_uid=esp32-01&at=2026-09-24T00:00:00Z`);assert.equal(response.status,200);assert.equal((await response.json()).data.ready,true);role='tenant';response=await fetch(`${base}/api/owner/hardware-readiness?device_uid=esp32-01`);assert.equal(response.status,403);}finally{await new Promise(r=>{server.closeAllConnections();server.close(r);});}
});
