import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {docker} from './local-docker.js';
const dir='.local/rfid-broker-verification',uid='rfid-acl-test';let id;
const mount=(a,b)=>['-v',`${resolve(a)}:${b}:ro`];
try{
 await mkdir(dir+'/devices',{recursive:true});await mkdir(dir+'/pzem',{recursive:true});
 await writeFile(dir+'/devices/'+uid,randomBytes(24).toString('hex'),{mode:0o600});
 await writeFile(dir+'/devices/rfid-pzem-acl-test',randomBytes(24).toString('hex'),{mode:0o600});
 await writeFile(dir+'/devices/rfid-pzem-extra-test',randomBytes(24).toString('hex'),{mode:0o600});
 await writeFile(dir+'/pzem/password',randomBytes(24).toString('hex'),{mode:0o600});
 const code=`const assert=require('node:assert/strict'),fs=require('node:fs'),mqtt=require('mqtt');
 (async()=>{const clients=[];const connect=async(username,password)=>{const c=await mqtt.connectAsync('mqtt://127.0.0.1:1883',{username,password,protocolVersion:5,reconnectPeriod:0,connectTimeout:3000});c.on('error',()=>{});clients.push(c);return c;};
 try{const root='smartbilling/v1/devices/${uid}/rfid/',received=[];
 const backend=await connect('smartbilling_dev',fs.readFileSync('/run/backend','utf8').trim());backend.on('message',(t,p)=>received.push([t,p.toString()]));await backend.subscribeAsync(root+'status',{qos:1});await backend.subscribeAsync(root+'taps',{qos:1});
 const reader=await connect('${uid}',fs.readFileSync('/run/reader','utf8').trim()),responses=[];reader.on('message',(_t,p)=>responses.push(p.toString()));await reader.subscribeAsync(root+'responses',{qos:1});
 await reader.publishAsync(root+'status','status-marker',{qos:1});await reader.publishAsync(root+'taps','tap-marker',{qos:1});await backend.publishAsync(root+'responses','response-marker',{qos:1});
 const until=Date.now()+3000;while((received.length<2||responses.length<1)&&Date.now()<until)await new Promise(r=>setTimeout(r,20));assert.equal(received.length,2);assert.deepEqual(responses,['response-marker']);
 for(const t of ['smartbilling/v1/devices/OTHER/rfid/taps',root+'responses','smartbilling/v1/devices/${uid}/readings'])await assert.rejects(()=>reader.publishAsync(t,'forbidden',{qos:1}),e=>e.code===135);
 const combo=await connect('rfid-pzem-acl-test',fs.readFileSync('/run/combo','utf8').trim());
 const comboTopic='smartbilling/v1/devices/rfid-pzem-acl-test/readings',samples=[];
 backend.on('message',(t,p)=>{if(t===comboTopic)samples.push(p.toString());});await backend.subscribeAsync(comboTopic,{qos:1});
 await combo.publishAsync(comboTopic,'isolated-sensor-marker',{qos:1});
 await combo.publishAsync('smartbilling/v1/devices/rfid-pzem-acl-test/status','isolated-status-marker',{qos:1});
 const sampleUntil=Date.now()+3000;while(!samples.length&&Date.now()<sampleUntil)await new Promise(r=>setTimeout(r,20));assert.deepEqual(samples,['isolated-sensor-marker']);
 const extra=await connect('rfid-pzem-extra-test',fs.readFileSync('/run/extra-combo','utf8').trim());
 await extra.publishAsync('smartbilling/v1/devices/rfid-pzem-extra-test/readings','isolated-extra-marker',{qos:1});
 await extra.publishAsync('smartbilling/v1/devices/rfid-pzem-extra-test/status','isolated-extra-status',{qos:1});
 await assert.rejects(()=>extra.publishAsync(comboTopic,'forbidden',{qos:1}),e=>e.code===135);
 await assert.rejects(()=>combo.publishAsync('smartbilling/v1/devices/rfid-pzem-extra-test/readings','forbidden',{qos:1}),e=>e.code===135);
 for(const t of ['smartbilling/v1/devices/OTHER/readings','smartbilling/v1/devices/OTHER/status',root+'taps','smartbilling/v1/devices/rfid-pzem-acl-test/rfid/responses'])await assert.rejects(()=>combo.publishAsync(t,'forbidden',{qos:1}),e=>e.code===135);
 const spy=[];reader.on('message',(t,p)=>spy.push(t));await reader.subscribeAsync('smartbilling/v1/devices/OTHER/rfid/responses',{qos:1});await backend.publishAsync('smartbilling/v1/devices/OTHER/rfid/responses','private',{qos:1});await new Promise(r=>setTimeout(r,100));assert.equal(spy.length,0);
 const pzem=await connect('pzem-acl-test',fs.readFileSync('/run/pzem','utf8').trim());await assert.rejects(()=>pzem.publishAsync(root+'taps','forbidden',{qos:1}),e=>e.code===135);
 await assert.rejects(()=>connect('${uid}','incorrect'),e=>e.code===135);await assert.rejects(()=>connect(undefined,undefined),e=>e.code===135);
 console.log('PASS isolated broker: RFID remains restricted; selected combo publishes own readings/status; cross-device and anonymous denied.');
 }finally{await Promise.all(clients.map(c=>c.endAsync(true)));}})().catch(()=>{console.error('RFID ACL verification failed');process.exitCode=1;});`;
 id=(await docker(['run','-d','--rm','--network','none','--tmpfs','/mosquitto/data','-e','PZEM_DASHBOARD_UID=pzem-acl-test','-e','RFID_PZEM_UID=rfid-pzem-acl-test','-e','RFID_PZEM_EXTRA_UID=rfid-pzem-extra-test',
 ...mount('docker/mosquitto/start-pzem-dashboard.sh','/opt/start.sh'),...mount('docker/mosquitto/health.sh','/opt/health.sh'),
 ...mount('.local/expo-local/secrets/mqtt_password','/run/secrets/mqtt_password'),...mount(dir+'/pzem/password','/run/secrets/pzem_dashboard_device_password'),
 ...mount('.local/expo-pzem/observer_password','/run/secrets/pzem_dashboard_observer_password'),...mount(dir+'/devices','/run/rfid-dashboard-devices'),
 '--entrypoint','/bin/sh','eclipse-mosquitto:2','/opt/start.sh'])).toString().trim();
 if(!/^[a-f0-9]{64}$/.test(id))throw new Error('invalid_container');
 for(let n=0;n<30;n++){try{await docker(['exec',id,'/bin/sh','/opt/health.sh']);break;}catch{if(n===29)throw new Error('not_ready');await new Promise(r=>setTimeout(r,200));}}
 const verify=async()=>console.log((await docker(['run','--rm','--network',`container:${id}`,
  ...mount('.local/expo-local/secrets/mqtt_password','/run/backend'),...mount(dir+'/devices/'+uid,'/run/reader'),...mount(dir+'/pzem/password','/run/pzem'),
  ...mount(dir+'/devices/rfid-pzem-acl-test','/run/combo'),
  ...mount(dir+'/devices/rfid-pzem-extra-test','/run/extra-combo'),
  'smartbilling-expo-local-backend','node','-e',code])).toString().trim());
 await verify();await docker(['restart',id]);
 for(let n=0;n<30;n++){try{await docker(['exec',id,'/bin/sh','/opt/health.sh']);break;}catch{if(n===29)throw new Error('not_ready');await new Promise(r=>setTimeout(r,200));}}
 await verify();
}catch{console.error('RFID broker test failed; no live database or host port used.');process.exitCode=1;}
finally{if(id&&/^[a-f0-9]{64}$/.test(id))await docker(['stop',id]).catch(()=>{});}
