import {readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {docker} from './local-docker.js';
const mount=(source,target)=>['-v',`${resolve(source)}:${target}:ro`];let id;
try{
 await mkdir('.local/expo-pzem/extra-devices',{recursive:true});
 id=(await docker(['run','-d','--rm','--network','none','--tmpfs','/mosquitto/data','-e','PZEM_DASHBOARD_UID=esp32-pzem-10003bd0ccf0',
  ...mount('docker/mosquitto/start-pzem-dashboard.sh','/opt/a05/start.sh'),...mount('.local/expo-local/secrets/mqtt_password','/run/secrets/mqtt_password'),
  ...mount('.local/expo-pzem/extra-devices','/run/pzem-extra-devices'),
  ...mount('.local/expo-pzem/device_password','/run/secrets/pzem_dashboard_device_password'),...mount('.local/expo-pzem/observer_password','/run/secrets/pzem_dashboard_observer_password'),
  '--entrypoint','/bin/sh','eclipse-mosquitto:2','/opt/a05/start.sh'])).toString().trim();
 if(!/^[a-f0-9]{64}$/.test(id))throw new Error('invalid_test_container');
 const code=await readFile('scripts/verify-pzem-dashboard-broker.js','utf8');
 const output=await docker(['run','--rm','--network',`container:${id}`,'-e','PZEM_VERIFY_URL=mqtt://127.0.0.1:1883','-e','PZEM_VERIFY_SECRETS=/run/pzem',
  ...mount(`${process.env.PZEM_VERIFY_SECRETS||'.local/expo-pzem'}/device_password`,'/run/pzem/device_password'),...mount('.local/expo-pzem/observer_password','/run/pzem/observer_password'),
  ...['PZEM_DASHBOARD_UID','PZEM_VERIFY_OTHER_UID'].flatMap(name=>process.env[name]?['-e',`${name}=${process.env[name]}`]:[]),
  'smartbilling-expo-local-backend','node','--input-type=module','-e',code]);
 console.info(output.toString().trim());console.info('Broker verification isolated: no host port, no external network, no database.');
}catch{console.error('Isolated broker verification failed.');process.exitCode=1;}
finally{if(id&&/^[a-f0-9]{64}$/.test(id))await docker(['stop',id]).catch(()=>{});}
