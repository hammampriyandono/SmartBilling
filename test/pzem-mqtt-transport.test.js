import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
test('standalone meter TLS preserves original sensor/state/payload/portal code and adds no relay control',async()=>{
 let source=(await readFile('firmware/pzem-dashboard/pzem-dashboard.ino','utf8')).replace(/\r\n/g,'\n');
 assert.doesNotMatch(source,/\b(relayBegin|setRelay|RelayDashboard)\b/);
 source=source.replace('#include "mqtt_transport.h"\n','').replace('MqttTransport network;','WiFiClient network;')
  .replace('sampling.networkWindow(utcNowUs(),MQTT_NETWORK_GUARD_US)','sampling.networkWindow(utcNowUs(),4000000ULL)')
  .replace(' configureMqttTransport(network);\n','')
  .replace('networkTimeAvailable()&&mqttTransportReady(ntpSynced.load())&&WiFi.status()','networkTimeAvailable()&&WiFi.status()')
  .replace(' // transport-specific interval before a boundary for sampling, while keeping\n // Wi-Fi responsive. TLS connections wait for a synchronized clock.',' // four seconds before a boundary for sampling, while keeping Wi-Fi responsive.');
 assert.equal(createHash('sha256').update(source).digest('hex'),'f8e5211dbf53d6440fc424971ece65eb62a1e2660bc5fd35ce42491d210ecb9c');
 const [meter,relay]=await Promise.all(['pzem-dashboard','pzem-relay-trial'].map(folder=>readFile('firmware/'+folder+'/mqtt_transport.h','utf8')));
 assert.equal(meter.replace(/\r\n/g,'\n'),relay.replace(/\r\n/g,'\n'),'Self-contained sketches must use the same tested TLS transport');
});
