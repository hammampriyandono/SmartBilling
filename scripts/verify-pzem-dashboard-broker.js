import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import mqtt from 'mqtt';
const uid=process.env.PZEM_DASHBOARD_UID||'esp32-pzem-10003bd0ccf0',directory=process.env.PZEM_VERIFY_SECRETS||'.local/expo-pzem';
const url=process.env.PZEM_VERIFY_URL||'mqtt://192.168.1.9:1884',clients=[];let phase='connect';
const devicePassword=(await readFile(`${directory}/device_password`,'utf8')).trim(),observerPassword=(await readFile(process.env.PZEM_VERIFY_OBSERVER_PASSWORD_FILE||`${directory}/observer_password`,'utf8')).trim();
const otherUid=process.env.PZEM_VERIFY_OTHER_UID||'OTHER_DEVICE';
if(!/^[A-Za-z0-9_-]{1,80}$/.test(uid)||!/^[A-Za-z0-9_-]{1,80}$/.test(otherUid)||otherUid===uid)throw new Error('invalid_verification_device_uid');
async function connect(credentials={},protocolVersion=5){const client=await mqtt.connectAsync(url,{clientId:`pzem-check-${randomUUID()}`,reconnectPeriod:0,connectTimeout:3000,protocolVersion,...credentials});client.on('error',()=>{});clients.push(client);return client;}
try{
 const topic=`smartbilling/v1/devices/${uid}/status`,received=[],deviceRead=[];
 const observer=await connect({username:'pzem-dashboard-observer',password:observerPassword});observer.on('message',(t,p)=>received.push({topic:t,payload:p.toString()}));await observer.subscribeAsync(topic,{qos:1});
 const device=await connect({username:uid,password:devicePassword},4);device.on('message',(_t,p)=>deviceRead.push(p.toString()));await device.subscribeAsync('#',{qos:1});
 phase='status_round_trip';const marker=`diagnostic:${randomUUID()}`;await device.publishAsync(topic,marker,{qos:1,retain:false});
 const until=Date.now()+3000;while(!received.some(row=>row.payload===marker)&&Date.now()<until)await new Promise(r=>setTimeout(r,30));
 assert.ok(received.some(row=>row.topic===topic&&row.payload===marker));assert.equal(deviceRead.length,0);
 phase='authentication';for(const credentials of [{},{username:uid,password:randomUUID()}])await assert.rejects(()=>connect(credentials),error=>error.code===135);
 phase='write_acl';const device5=await connect({username:uid,password:devicePassword});
 for(const forbidden of [`smartbilling/v1/devices/${otherUid}/readings`,'smartbilling/test/pzem/kamar2'])await assert.rejects(()=>device5.publishAsync(forbidden,marker,{qos:1}),error=>error.code===135);
 await assert.rejects(()=>observer.publishAsync(topic,marker,{qos:1}),error=>error.code===135);
 console.info('PASS: MQTT auth, own-status round trip, device read denied, foreign-topic/observer write denied by MQTT5 PUBACK. No sensor readings generated.');
}catch(error){console.error(JSON.stringify({status:'broker_verification_failed',phase,code:typeof error.code==='number'?error.code:'connection_or_assertion'}));process.exitCode=1;}
finally{for(const client of clients)await client.endAsync(true);}
