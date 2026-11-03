import {readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {docker} from './local-docker.js';
const mount=(source,target)=>['-v',`${resolve(source)}:${target}:ro`];let id;
async function waitBrokerReady(){
 for(let attempt=0;attempt<20;attempt++){
  try{await docker(['exec',id,'/bin/sh','/opt/a05/health.sh']);return;}
  catch{await new Promise(resolve=>setTimeout(resolve,250));}
 }
 throw new Error('test_broker_not_ready');
}
try{
 // Both entrypoints regenerate mosquitto-owned files when the same container restarts.
 id=(await docker(['run','-d','--rm','--network','none','--tmpfs','/mosquitto/data',
  ...mount('docker/mosquitto/start.sh','/opt/a05/start.sh'),...mount('docker/mosquitto/health.sh','/opt/a05/health.sh'),
  ...mount('docker/mosquitto/mosquitto.conf','/mosquitto/config/mosquitto.conf'),...mount('.local/expo-local/secrets/mqtt_password','/run/secrets/mqtt_password'),
  '--entrypoint','/bin/sh','eclipse-mosquitto:2','/opt/a05/start.sh'])).toString().trim();
 if(!/^[a-f0-9]{64}$/.test(id))throw new Error('invalid_test_container');
 await waitBrokerReady();
 await docker(['restart',id]);
 await waitBrokerReady();
 console.info('PASS: baseline broker authenticated health check before and after restarting the same container.');
 await docker(['stop',id]);id=null;
 await mkdir('.local/expo-pzem/extra-devices',{recursive:true});
 id=(await docker(['run','-d','--rm','--network','none','--tmpfs','/mosquitto/data','-e','PZEM_DASHBOARD_UID=esp32-pzem-10003bd0ccf0',
  ...mount('docker/mosquitto/start-pzem-dashboard.sh','/opt/a05/start.sh'),...mount('docker/mosquitto/health.sh','/opt/a05/health.sh'),...mount('.local/expo-local/secrets/mqtt_password','/run/secrets/mqtt_password'),
  ...mount('.local/expo-pzem/extra-devices','/run/pzem-extra-devices'),
  ...mount('.local/expo-pzem/device_password','/run/secrets/pzem_dashboard_device_password'),...mount('.local/expo-pzem/observer_password','/run/secrets/pzem_dashboard_observer_password'),
  '--entrypoint','/bin/sh','eclipse-mosquitto:2','/opt/a05/start.sh'])).toString().trim();
 if(!/^[a-f0-9]{64}$/.test(id))throw new Error('invalid_test_container');
 const code=await readFile('scripts/verify-pzem-dashboard-broker.js','utf8');
 async function verifyBroker(){
  await waitBrokerReady();
  const output=await docker(['run','--rm','--network',`container:${id}`,'-e','PZEM_VERIFY_URL=mqtt://127.0.0.1:1883','-e','PZEM_VERIFY_SECRETS=/run/pzem',
  ...mount(`${process.env.PZEM_VERIFY_SECRETS||'.local/expo-pzem'}/device_password`,'/run/pzem/device_password'),...mount('.local/expo-pzem/observer_password','/run/pzem/observer_password'),
  ...['PZEM_DASHBOARD_UID','PZEM_VERIFY_OTHER_UID'].flatMap(name=>process.env[name]?['-e',`${name}=${process.env[name]}`]:[]),
  'smartbilling-expo-local-backend','node','--input-type=module','-e',code]);
  console.info(output.toString().trim());
 }
 await verifyBroker();
 await docker(['restart',id]);
 await verifyBroker();
 console.info('Broker restart verified in the same container; authentication and ACL still enforced.');
 console.info('Broker verification isolated: no host port, no external network, no database.');
}catch{console.error('Isolated broker verification failed.');process.exitCode=1;}
finally{if(id&&/^[a-f0-9]{64}$/.test(id))await docker(['stop',id]).catch(()=>{});}
