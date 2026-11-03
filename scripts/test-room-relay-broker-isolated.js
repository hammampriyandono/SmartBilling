import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import {docker} from './local-docker.js';

let container;const root=resolve('.local/room-relay-tests',randomUUID());
const mount=(source,target)=>['-v',`${resolve(source)}:${target}:ro`];
await mkdir(resolve(root,'extras'),{recursive:true});await mkdir(resolve(root,'rfids'),{recursive:true});
for(const file of ['backend','device','primary','observer','extras/relay-fixture-other'])await writeFile(resolve(root,file),randomBytes(24).toString('hex'),{flag:'wx',mode:0o600});
await writeFile(resolve(root,'rfids/relay-fixture-target'),await readFile(resolve(root,'device')),{flag:'wx',mode:0o600});
async function waitReady(){for(let i=0;i<30;i++){try{await docker(['exec',container,'/bin/sh','/opt/a05/health.sh']);return;}catch{await new Promise(resolve=>setTimeout(resolve,200));}}throw Error('broker_not_ready');}
async function verify(enabled,label){
  await waitReady();const logfile=resolve(root,`${label}.log`);
  try{await docker(['run','--rm','--network',`container:${container}`,'-e',`RELAY_TEST_ENABLED=${enabled}`,
    ...mount(root,'/run/fixture'),...mount('scripts/room-relay-broker-fixture.mjs','/app/scripts/room-relay-broker-fixture.mjs'),
    'smartbilling-expo-local-backend','node','scripts/room-relay-broker-fixture.mjs'],{outputFile:logfile});}
  finally{console.info(await readFile(logfile,'utf8'));}
}
try{
  for(const mode of ['disabled','pzem','combo']){
    const enabled=mode!=='disabled',combo=mode==='combo';
    container=(await docker(['run','-d','--rm','--network','none','--tmpfs','/mosquitto/data',
      '-e',`PZEM_DASHBOARD_UID=${combo?'relay-fixture-primary':'relay-fixture-target'}`,...(enabled?['-e','ROOM_RELAY_DEVICE_UID=relay-fixture-target']:[]),
      ...(combo?['-e','RFID_PZEM_EXTRA_UID=relay-fixture-target',...mount(resolve(root,'rfids'),'/run/rfid-dashboard-devices')]:[]),
      ...mount('docker/mosquitto/start-pzem-dashboard.sh','/opt/a05/start.sh'),...mount('docker/mosquitto/health.sh','/opt/a05/health.sh'),
      ...mount(resolve(root,'backend'),'/run/secrets/mqtt_password'),...mount(resolve(root,combo?'primary':'device'),'/run/secrets/pzem_dashboard_device_password'),
      ...mount(resolve(root,'observer'),'/run/secrets/pzem_dashboard_observer_password'),...mount(resolve(root,'extras'),'/run/pzem-extra-devices'),
      '--entrypoint','/bin/sh','eclipse-mosquitto:2','/opt/a05/start.sh'])).toString().trim();
    if(!/^[a-f0-9]{64}$/.test(container))throw Error('invalid_container');
    await verify(enabled,mode);
    if(enabled){await docker(['restart',container]);await verify(true,mode+'-restarted');}
    await docker(['stop',container]);container=null;
  }
  console.info('PASS: isolated Mosquitto ACL tests, no host port, live devices or app broker.');
}catch(error){console.error(`Relay broker tests failed: ${error.message}`);process.exitCode=1;}
finally{if(container&&/^[a-f0-9]{64}$/.test(container))await docker(['stop',container]).catch(()=>{});}
