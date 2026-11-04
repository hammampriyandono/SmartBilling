// Invoked only by test-room-relay-broker-isolated.js in a network-none namespace.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import mqtt from 'mqtt';

const target='relay-fixture-target',other='relay-fixture-other',clients=[],enabled=process.env.RELAY_TEST_ENABLED==='true';
const production=process.env.RELAY_TEST_PRODUCTION==='true';
const password=async name=>(await readFile(`/run/fixture/${name}`,'utf8')).trim();
const connect=async(username,file)=>{
  const client=await mqtt.connectAsync('mqtt://127.0.0.1:1883',{clientId:`relay-test-${randomUUID()}`,protocolVersion:5,
    reconnectPeriod:0,connectTimeout:3000,username,password:await password(file)});
  client.on('error',()=>{});clients.push(client);return client;
};
const waitFor=async check=>{const deadline=Date.now()+2000;while(!check()&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,20));assert.ok(check());};
try{
  const backend=await connect('smartbilling_dev','backend'),device=await connect(target,'device'),foreign=await connect(other,`extras/${other}`),observer=await connect('pzem-dashboard-observer','observer');
  const command=`smartbilling/v1/devices/${target}/relay/commands`,status=`smartbilling/v1/devices/${target}/relay/status`,marker=randomUUID();
  const forbidden=async(client,topic)=>assert.rejects(client.publishAsync(topic,marker,{qos:1,retain:false}),error=>error.code===135);
  if(!enabled){await forbidden(backend,command);await forbidden(device,status);console.info('PASS: relay ACL disabled by default.');}
  else{
    const seen={device:[],foreign:[],observer:[],backend:[]};
    for(const [name,client] of Object.entries({device,foreign,observer,backend})){
      client.on('message',(topic,bytes)=>seen[name].push({topic,value:bytes.toString()}));await client.subscribeAsync('#',{qos:1});
    }
    await backend.publishAsync(command,marker,{qos:1,retain:false});await waitFor(()=>seen.device.some(x=>x.topic===command&&x.value===marker));
    assert.equal(seen.foreign.length,0);assert.equal(seen.observer.length,0);assert.equal(seen.backend.length,0);
    await device.publishAsync(status,marker,{qos:1,retain:false});await waitFor(()=>seen.backend.some(x=>x.topic===status&&x.value===marker));
    for(const [client,topic] of [[device,command],[foreign,command],[foreign,status],[backend,status],[backend,command.replace(target,other)],[observer,command]])await forbidden(client,topic);
    // Repeated user sections must retain baseline telemetry permissions.
    const ordinary=`smartbilling/v1/devices/${target}/status`;
    await device.publishAsync(ordinary,marker,{qos:1,retain:false});
    if(!production)await waitFor(()=>seen.observer.some(x=>x.topic===ordinary&&x.value===marker));
    const readings=`smartbilling/v1/devices/${other}/readings`;
    await foreign.publishAsync(readings,marker,{qos:1,retain:false});await waitFor(()=>seen.backend.some(x=>x.topic===readings&&x.value===marker));
    assert.equal(seen.foreign.length,0);
    console.info('PASS: selected-device command/report round trip; foreign device, observer and reverse-direction writes denied; baseline telemetry preserved.');
  }
}finally{for(const client of clients)await client.endAsync(true);}
