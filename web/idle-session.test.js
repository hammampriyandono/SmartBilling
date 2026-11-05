import test from 'node:test';
import assert from 'node:assert/strict';
import {trackIdleSession} from './idle-session.js';

function fixture(){
  let now=100000,serverLast=now,expired=0,sends=0,checks=0;const timers=new Map();let next=0;
  const handlers=new Map(),target={addEventListener(type,fn){handlers.set(type,fn);},removeEventListener(type){handlers.delete(type);}};
  const session=()=>({issued_at:100000,last_activity_at:serverLast,idle_expires_at:serverLast+900000,expires_at:100000+28800000,server_time:now});
  const tracker=trackIdleSession({target,visibilityTarget:target,session:session(),clock:()=>now,setTimer:(fn,delay)=>{const id=++next;timers.set(id,{fn,at:now+delay});return id;},clearTimer:id=>timers.delete(id),
    sendActivity:async age=>{sends++;serverLast=Math.max(serverLast,now-age());return session();},verify:async()=>{checks++;if(now>=serverLast+900000)throw Error('expired');return session();},onExpire:()=>expired++});
  const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
  return{tracker,handlers,session,flush,event:async(type,trusted=true)=>{handlers.get(type)?.({isTrusted:trusted});await flush();},
    advance:async ms=>{now+=ms;for(const [id,t]of [...timers])if(t.at<=now){timers.delete(id);t.fn();}await flush();},
    poll(){tracker.update(session());},otherTab(){serverLast=now;},get sends(){return sends;},get expired(){return expired;},get checks(){return checks;}};
}
test('idle frontend: polling/focus/synthetic events do not count; expires at 15 minutes',async()=>{
  const f=fixture();for(let i=0;i<179;i++){await f.advance(5000);f.poll();}
  await f.event('pointermove',false);await f.event('focus');await f.event('visibilitychange');
  assert.equal(f.sends,0);assert.equal(f.expired,0);
  await f.advance(5000);assert.equal(f.expired,1);assert.equal(f.checks,1);assert.equal(f.handlers.size,0);
});
test('idle frontend: trusted input renews; trailing heartbeat preserves actual activity age',async()=>{
  const f=fixture();await f.advance(600000);await f.event('keydown');assert.equal(f.sends,1);
  await f.advance(5000);await f.event('pointerdown');assert.equal(f.sends,1);
  await f.advance(25000);assert.equal(f.sends,2);
  await f.advance(874999);assert.equal(f.expired,0);
  await f.advance(1);assert.equal(f.expired,1,'expires relative to input, not delayed heartbeat');
});
test('idle frontend: other tab activity, sleep/resume and cleanup do not falsely log out',async()=>{
  const f=fixture();await f.advance(899999);f.otherTab();await f.advance(1);
  assert.equal(f.expired,0);assert.equal(f.checks,1);assert.equal(f.sends,0);
  f.tracker.stop();assert.equal(f.handlers.size,0);await f.advance(999999);assert.equal(f.expired,0);
  const slept=fixture();await slept.advance(3600000);await slept.event('visibilitychange');assert.equal(slept.expired,1);assert.equal(slept.sends,0);
});
