// Only trusted human input sends activity. Polling, focus and visibility changes
// only check the deadline. The server remains authoritative across tabs/sleep.
export function trackIdleSession({target,visibilityTarget,session,sendActivity,verify,onExpire,
  clock=Date.now,setTimer=setTimeout,clearTimer=clearTimeout,throttleMs=30000}) {
  let stopped=false,deadline=0,lastServerActivity=-Infinity,lastEvent=-Infinity,lastAttempt=-Infinity;
  let activityTimer,expiryTimer,busy=false,checking=false;
  const events=['pointerdown','pointermove','keydown','input','wheel','touchstart','touchmove'];
  function update(next) {
    if(stopped||!next||next.last_activity_at<lastServerActivity)return;
    if(![next.server_time,next.idle_expires_at,next.expires_at,next.last_activity_at].every(Number.isFinite))return;
    lastServerActivity=next.last_activity_at;
    deadline=clock()+Math.max(0,Math.min(next.idle_expires_at,next.expires_at)-next.server_time);
    clearTimer(expiryTimer);expiryTimer=setTimer(check,Math.max(1,deadline-clock()));
  }
  async function check() {
    if(stopped||checking||clock()<deadline)return;
    checking=true;
    try{update(await verify());}catch{if(!stopped){stop();onExpire();}}
    finally{checking=false;}
  }
  function schedule() {
    if(stopped||busy||activityTimer!==undefined)return;
    const delay=Math.max(0,throttleMs-(clock()-lastAttempt));
    if(delay===0)void send();else activityTimer=setTimer(()=>{activityTimer=undefined;void send();},delay);
  }
  async function send() {
    if(stopped||busy)return;
    const observed=lastEvent;if(clock()-observed>60000)return;
    busy=true;lastAttempt=clock();
    try{update(await sendActivity(()=>Math.max(0,Math.floor(clock()-observed))));}
    catch(error){if(error.status===401&&!stopped){stop();onExpire();}}
    finally{busy=false;if(!stopped&&lastEvent>observed)schedule();}
  }
  function activity(event) {
    if(stopped||event.isTrusted!==true)return;
    if(clock()>=deadline){void check();return;}
    lastEvent=clock();schedule();
  }
  function resume(){void check();}
  function stop() {
    stopped=true;clearTimer(activityTimer);clearTimer(expiryTimer);
    for(const type of events)target.removeEventListener(type,activity);
    target.removeEventListener('focus',resume);visibilityTarget.removeEventListener('visibilitychange',resume);
  }
  for(const type of events)target.addEventListener(type,activity,{passive:true});
  target.addEventListener('focus',resume);visibilityTarget.addEventListener('visibilitychange',resume);
  update(session);return {update,stop};
}
