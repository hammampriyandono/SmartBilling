import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {docker} from './local-docker.js';
const root=resolve('.local/production-relay-tests',randomUUID());let container;
await mkdir(resolve(root,'extras'),{recursive:true});
const passwords={};for(const file of ['backend','device','observer','extras/relay-fixture-other']){
 passwords[file]=randomBytes(32).toString('hex');await writeFile(resolve(root,file),passwords[file],{mode:0o600});
}
const mount=(a,b)=>['-v',`${resolve(a)}:${b}:ro`];
async function runArgs(mode){
 const role=mode==='combo'?'combined':mode==='invalid-role'?'rfid':'sensor';
 await writeFile(resolve(root,'devices'),[`relay-fixture-target|${role}|${passwords.device}`,`relay-fixture-other|sensor|${passwords['extras/relay-fixture-other']}`,`pzem-dashboard-observer|sensor|${passwords.observer}`].join('\n'));
 await writeFile(resolve(root,'broker.env'),`MQTT_BACKEND_USERNAME=smartbilling_dev\nMQTT_BACKEND_PASSWORD=${passwords.backend}\n${mode==='disabled'?'':`ROOM_RELAY_DEVICE_UID=${mode==='unknown'?'unregistered-fixture':'relay-fixture-target'}\n`}`,{mode:0o600});
 return ['--network','none','--tmpfs','/mosquitto/data','--env-file',resolve(root,'broker.env'),...mount(root,'/run/fixture'),...mount('docker/mosquitto/start-production.sh','/opt/splitzbill/start.sh'),'--entrypoint','/bin/sh','eclipse-mosquitto:2','-c','export MQTT_DEVICE_CREDENTIALS="$(cat /run/fixture/devices)"; exec /bin/sh /opt/splitzbill/start.sh'];
}
async function verify(enabled,label){
 let ready=false;for(let i=0;i<40;i++){try{await docker(['exec',container,'/bin/sh','-c','grep -q mosquitto /proc/1/comm']);ready=true;break;}catch{await new Promise(r=>setTimeout(r,100));}}assert.ok(ready);
 const file=resolve(root,label+'.log');try{await docker(['run','--rm','--network','container:'+container,'-e','RELAY_TEST_PRODUCTION=true','-e','RELAY_TEST_ENABLED='+enabled,...mount(root,'/run/fixture'),...mount('scripts/room-relay-broker-fixture.mjs','/app/scripts/room-relay-broker-fixture.mjs'),'smartbilling-expo-local-backend','node','scripts/room-relay-broker-fixture.mjs'],{outputFile:file});}finally{console.log(await readFile(file,'utf8'));}
}
try{
 for(const mode of ['disabled','sensor','combo']){
  container=(await docker(['run','-d','--rm',...await runArgs(mode)])).toString().trim();assert.match(container,/^[a-f0-9]{64}$/);
  await verify(mode!=='disabled',mode);if(mode!=='disabled'){await docker(['restart',container]);await verify(true,mode+'-restart');}
  await docker(['stop',container]);container=null;
 }
 for(const mode of ['unknown','invalid-role'])await assert.rejects(()=>runArgs(mode).then(args=>docker(['run','--rm',...args])));
 console.log('PASS: production relay ACL opt-in, target/role validation, direction isolation and restart; no live topics or host ports.');
}finally{if(container)await docker(['stop',container]).catch(()=>{});}
