import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const normalized=async file=>(await readFile(file,'utf8')).replace(/\r\n/g,'\n');
const sha=s=>createHash('sha256').update(s).digest('hex');
test('RFID TLS leaves card/local relay/session boundary and sensor source unchanged',async()=>{
 const root='firmware/rfid-pzem-v42-sesi/';
 assert.equal(sha(await normalized(root+'rfid-pzem-v42-sesi.ino')),'4e0df389662a6b1ac0c7d2fa744be7a023cbe06ff4aa9c5fac9103cb847e9db9');
 assert.equal(sha(await normalized(root+'pzem_link.h')),'6f9c0e8de7aa1e0404e2ed23f25b8438a56191c6cfce6a6c497b59ed97656c1c');
 let transport=await normalized(root+'dashboard_link.h');
 transport=transport.replace('#include "mqtt_transport.h"\n','').replace('MqttTransport network;','WiFiClient network;')
  .replace('        configureMqttTransport(network);\n','').replace('mqttTransportReady(clockReady()) && ','');
 assert.equal(sha(transport),'084b9ee02989e59d965857a5532122c7addd228b08d25c8b774ecd7daa4669d8');
 assert.equal(await normalized(root+'mqtt_transport.h'),await normalized('firmware/pzem-relay-trial/mqtt_transport.h'));
});
