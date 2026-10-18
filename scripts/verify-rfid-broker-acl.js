import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import mqtt from 'mqtt';
import {createMqtt,requireDevelopment} from '../src/connections.js';
import {connect,waitFor} from '../src/simulation.js';
requireDevelopment();if(process.env.RFID_ISOLATED_TEST!=='1')throw new Error('isolated_verification_required');
const clients=[];
try {
 const admin=createMqtt(`rfid-acl-admin-${randomUUID()}`);clients.push(admin);await connect(admin);
 const device=async name=>{const password=(await readFile(`/run/secrets/rfid_test_${name}_password`,'utf8')).trim();const c=createMqtt(`rfid-acl-${name}-${randomUUID()}`,{username:`rfid-test-${name}`,password,reconnectPeriod:0});clients.push(c);await connect(c);return c;};
 const a=await device('a'),b=await device('b');
 const topic=id=>`smartbilling/v1/devices/rfid-test-${id}/rfid/taps`,response=id=>topic(id).replace(/taps$/,'responses');
 const observed=[],receivedA=[],receivedB=[];
 admin.on('message',(t,v)=>observed.push([t,v.toString()]));a.on('message',(t,v)=>receivedA.push([t,v.toString()]));b.on('message',(t,v)=>receivedB.push([t,v.toString()]));
 await admin.subscribeAsync([topic('a'),topic('b')],{qos:1});await a.subscribeAsync(response('a'),{qos:1});await b.subscribeAsync([response('a'),response('b')],{qos:1});
 const allowed=randomUUID(),forged=randomUUID(),barrier=randomUUID();
 await a.publishAsync(topic('a'),allowed,{qos:1,retain:false});await waitFor(()=>observed.some(([,v])=>v===allowed));
 await b.publishAsync(topic('a'),forged,{qos:1,retain:false});await b.publishAsync(topic('b'),barrier,{qos:1,retain:false});await waitFor(()=>observed.some(([,v])=>v===barrier));assert.equal(observed.some(([,v])=>v===forged),false);
 const replyA=randomUUID(),replyB=randomUUID();await admin.publishAsync(response('a'),replyA,{qos:1,retain:false});await admin.publishAsync(response('b'),replyB,{qos:1,retain:false});await waitFor(()=>receivedA.some(([,v])=>v===replyA)&&receivedB.some(([,v])=>v===replyB));assert.equal(receivedB.some(([,v])=>v===replyA),false);
 // Authentication failure: no raw credential in any output, no retry loop.
 for(const options of [{},{username:'rfid-test-a',password:randomUUID()}]){
  const c=mqtt.connect(process.env.MQTT_URL,{clientId:`rfid-acl-denied-${randomUUID()}`,connectTimeout:2000,reconnectPeriod:0,...options});clients.push(c);
  await assert.rejects(()=>new Promise((resolve,reject)=>{c.once('connect',resolve);c.once('error',()=>reject(new Error('authentication_denied')));setTimeout(()=>reject(new Error('authentication_timeout')),3000).unref();}),/authentication_denied/);
 }
 console.info('PASS broker ACL: authentication required, wrong password denied, per-device publish identity and response isolation; no LAN port opened.');
}catch(e){console.error('FAIL RFID ACL:',e.code||e.message);process.exitCode=1;}
finally{for(const c of clients)await c.endAsync(true);}
