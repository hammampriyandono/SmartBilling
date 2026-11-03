import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {parseRoomRelayReport,relayFresh,relayWire} from '../src/room-relay-protocol.js';
import {createRoomRelayWorker} from '../src/room-relay.js';
import {subscribedTopics} from '../src/runtime-mode.js';

const now=Date.parse('2026-11-02T02:00:00Z'),topic='smartbilling/v1/devices/room-test/relay/status';
const report=()=>({schema_version:1,binding_id:randomUUID(),boot_id:randomUUID(),report_sequence:1,reported_at:new Date(now).toISOString(),
  state:'off',gpio_pin:3,gpio_level:0,command_id:null,command_sequence:null,result:'status',reason:null});
const parse=(value,packet={qos:1},t=topic)=>parseRoomRelayReport(t,Buffer.from(JSON.stringify(value)),packet,now);

test('relay protocol: valid report and command identity retain exact sequence and timestamps',()=>{
  const value=report(),parsed=parse(value);assert.equal(parsed.device_uid,'room-test');assert.equal(parsed.state,'off');
  const id=randomUUID();assert.equal(parse({...value,result:'applied',state:'on',gpio_level:1,command_id:id,command_sequence:'9007199254740993'}).command_id,id);
  const wire=relayWire({id,binding_id:value.binding_id,sequence_no:'9007199254740993',target_boot_id:value.boot_id,desired_state:'off',issued_at:now,expires_at:now+15000});
  assert.equal(wire.sequence_no,'9007199254740993');assert.equal(wire.desired_state,'off');assert.equal(wire.expires_at,'2026-11-02T02:00:15.000Z');
});
test('relay protocol: reject retained, QoS0, simulator, unknown fields, bad times and malformed ACK',()=>{
  const value=report();
  for(const bad of [null,[],{...value,extra:'x'},{...value,reported_at:'2026-11-02T09:00:00'},
    {...value,reported_at:new Date(now-30001).toISOString()},{...value,reported_at:new Date(now+5001).toISOString()},
    {...value,state:'ON'},{...value,state:'on',gpio_level:0},{...value,gpio_pin:4},{...value,gpio_level:2},
    {...value,report_sequence:-1},{...value,result:'applied'},
    {...value,result:'applied',command_id:randomUUID(),command_sequence:'9223372036854775808'},
    {...value,command_id:randomUUID()},{...value,reason:'expired'}])assert.throws(()=>parse(bad));
  assert.throws(()=>parse(value,{qos:1,retain:true}));assert.throws(()=>parse(value,{qos:0}));
  assert.throws(()=>parse(value,{qos:1},topic.replace('/v1/','/sim/v1/')));
  assert.throws(()=>parseRoomRelayReport(topic,Buffer.alloc(2049),{qos:1},now));
});
test('relay freshness requires recent device time and receipt; no inference from a zero watt sample',()=>{
  const fresh={last_reported_at:new Date(now-1000),last_received_at:new Date(now-500)};
  assert.equal(relayFresh(fresh,now),true);assert.equal(relayFresh(null,now),false);
  assert.equal(relayFresh({...fresh,last_reported_at:new Date(now-31000)},now),false);
  assert.equal(relayFresh({...fresh,last_received_at:new Date(now-31000)},now),false);
});
test('relay disabled by default: no database access, publish or MQTT subscription',async()=>{
  await createRoomRelayWorker({query(){throw Error('must not query');}},{publish(){throw Error('must not publish');}})();
  assert.ok(!subscribedTopics('operational','test').some(t=>t.endsWith('/relay/status')));
  assert.ok(subscribedTopics('operational','test',{roomRelay:true}).some(t=>t.endsWith('/relay/status')));
});
