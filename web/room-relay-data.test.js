import test from 'node:test';
import assert from 'node:assert/strict';
import {relayAction,relayStateLabel,sendRelayAction,loadRoomRelay} from './room-relay-data.js';

test('relay UI: unknown and stale reports do not claim electricity OFF; unready buttons cannot create commands',()=>{
  assert.match(relayStateLabel(null),/belum diketahui/);
  assert.match(relayStateLabel({fresh:false,reported_state:'off'}),/belum diketahui/);
  assert.equal(relayStateLabel({fresh:true,reported_state:'off',gpio_pin:3,gpio_level:0}),'GPIO3 LOW · OFF');
  assert.equal(relayStateLabel({fresh:true,reported_state:'on',gpio_pin:3,gpio_level:1}),'GPIO3 HIGH · ON');
  assert.throws(()=>relayAction({can_control:false},'off','tes','owner'));
});
test('relay UI: same action/key/body on retry; desired state and selected installation explicit',async()=>{
  const action=relayAction({can_control:true,room_id:'r2',meter_id:'m2',row_version:3},'off',' Tes owner ','owner');
  const calls=[];let first=true;
  const request=async(path,options)=>{
    if(path.endsWith('/csrf'))return new Response(JSON.stringify({csrf:'test'}));
    calls.push({path,...options});if(first){first=false;throw Error('timeout');}
    return new Response(JSON.stringify({data:{command:{status:'queued'}}}),{status:202});
  };
  await assert.rejects(sendRelayAction(action,new AbortController().signal,request),e=>e.retry===true);
  await sendRelayAction(action,new AbortController().signal,request);
  assert.equal(calls[0].headers['Idempotency-Key'],calls[1].headers['Idempotency-Key']);
  assert.equal(calls[0].body,calls[1].body);assert.equal(calls[0].headers['X-Account-ID'],'owner');
  assert.deepEqual(JSON.parse(action.body),{meter_id:'m2',row_version:3,desired_state:'off',reason:'Tes owner'});
});
test('relay UI: request uses owner identity and fails visibly on API error',async()=>{
  await assert.rejects(loadRoomRelay('room','owner',new AbortController().signal,async(_path,options)=>{
    assert.equal(options.headers['X-Account-ID'],'owner');return new Response('{}',{status:403});
  }),/belum dapat dimuat/);
});
