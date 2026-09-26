import {randomUUID} from 'node:crypto';
import {parseTap} from './rfid-message.js';
import {Rejection,sha256} from './sensor-message.js';
import {reconcileSession} from './rfid-energy.js';

async function reject(db,topic,bytes,reason) {
 await db.query('INSERT INTO mqtt_rejections(reason,topic_sha256,payload_sha256,payload_bytes) VALUES($1,$2,$3,$4)',[`rfid_${reason}`,sha256(topic),sha256(bytes),bytes.length]);
 return {status:'rejected',reason};
}
export async function receiveTap(pool,topic,bytes,packet) {
 let parsed;try{parsed=parseTap(topic,bytes,packet);}catch(e){if(e instanceof Rejection)return reject(pool,topic,bytes,e.message);throw e;}
 const {device_uid,payload:p}=parsed,hash=sha256(JSON.stringify(p));
 const db=await pool.connect();let deviceId;
 try {
  await db.query('BEGIN');
  const device=(await db.query('SELECT d.id,d.source FROM devices d JOIN rfid_stream_state s ON s.device_id=d.id WHERE d.device_uid=$1 AND d.status=$2 FOR UPDATE OF d',[device_uid,'active'])).rows[0];
  if(!device){await reject(db,topic,bytes,'unknown_or_inactive_device');await db.query('COMMIT');return {status:'rejected'};}
  deviceId=device.id;
  const existing=(await db.query('SELECT * FROM device_events WHERE device_id=$1 AND boot_id=$2 AND sequence_no=$3',[deviceId,p.boot_id,p.sequence_no])).rows[0];
  if(existing) {
   if(existing.payload_sha256!==hash)await reject(db,topic,bytes,'identity_conflict');
  }else await db.query(`INSERT INTO device_events(device_id,boot_id,sequence_no,event_type,occurred_at,payload,payload_sha256,previous_boot_id,previous_sequence_no,data_source)
   VALUES($1,$2,$3,'rfid_tap',$4,$5,$6,$7,$8,$9)`,[deviceId,p.boot_id,p.sequence_no,p.occurred_at,p,hash,p.previous_event?.boot_id||null,p.previous_event?.sequence_no??null,device.source==='simulation'?'simulation':'production']);
  await db.query('COMMIT');
 }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{db.release();}
 await processDevice(pool,deviceId);
 return {status:'stored'};
}
async function applyTap(db,event) {
 const p=event.payload,time=event.occurred_at;
 if(+new Date(time)>Date.now())return {reason:'future_time'};
 const reader=(await db.query(`SELECT r.*,c.is_active,c.load_type FROM rfid_readers r JOIN communal_loads c ON c.id=r.communal_load_id
  WHERE r.device_id=$1 AND r.reader_channel=$2 AND r.active_from<=$3 AND (r.active_until IS NULL OR r.active_until>$3)`,[event.device_id,p.reader_channel,time])).rows[0];
 if(!reader)return {reason:'unknown_reader'};
 const facility=(await db.query('SELECT * FROM communal_loads WHERE id=$1 FOR UPDATE',[reader.communal_load_id])).rows[0];
 const open=(await db.query('SELECT s.*,p.rfid_card_id,p.occupancy_id,c.uid AS card_uid FROM usage_sessions s JOIN session_participants p ON p.usage_session_id=s.id JOIN rfid_cards c ON c.id=p.rfid_card_id WHERE s.communal_load_id=$1 AND s.ended_at IS NULL FOR UPDATE OF s',[reader.communal_load_id])).rows[0];
 async function invalid(reason,mark=false){if(mark&&open)await db.query("UPDATE usage_sessions SET status='review',review_reason=$2 WHERE id=$1",[open.id,reason]);return {reason};}
 if(!facility.is_active||facility.load_type!=='attributable')return invalid('unavailable_facility',true);
 const last=(await db.query('SELECT max(COALESCE(ended_at,started_at)) AS time FROM usage_sessions WHERE communal_load_id=$1',[reader.communal_load_id])).rows[0].time;
 const card=(await db.query(`SELECT c.*,u.is_active FROM rfid_cards c JOIN users u ON u.id=c.user_id WHERE c.uid=$1
  AND c.registered_at<=$2 AND (c.revoked_at IS NULL OR c.revoked_at>$2) AND u.role='tenant' FOR SHARE OF c,u`,[p.card_uid,time])).rows[0];
 if(!card||!card.is_active)return invalid('invalid_card_or_account',open?.card_uid===p.card_uid);
 if(open && card.id!==open.rfid_card_id)return invalid('facility_busy');
 if(last && +new Date(time)<=+new Date(last))return invalid('non_increasing_time',true);
 const occupancy=(await db.query(`SELECT o.* FROM occupancies o JOIN rooms r ON r.id=o.room_id WHERE o.user_id=$1 AND r.property_id=$2
  AND o.starts_at<=$3 AND (o.ends_at IS NULL OR o.ends_at>$3) FOR SHARE OF o`,[card.user_id,reader.property_id,time])).rows[0];
 if(!occupancy || (open&&occupancy.id!==open.occupancy_id))return invalid('invalid_occupancy',true);
 const meter=(await db.query(`SELECT * FROM meters WHERE communal_load_id=$1 AND installed_at<=$2 AND (retired_at IS NULL OR retired_at>$2) FOR SHARE`,[reader.communal_load_id,time])).rows[0];
 if(!meter || (open&&meter.id!==open.meter_id))return invalid('meter_changed_or_unavailable',true);
 if(open) {
  await db.query("UPDATE usage_sessions SET end_event_id=$2,ended_at=$3,status='completed',review_reason=NULL WHERE id=$1",[open.id,event.id,time]);
  return {action:'closed'};
 }
 const id=randomUUID();
 await db.query(`INSERT INTO usage_sessions(id,communal_load_id,meter_id,device_session_key,start_event_id,started_at,status,energy_reason,data_source)
  VALUES($1,$2,$3,$4,$5,$6,'active','session_open',$7)`,[id,reader.communal_load_id,meter.id,`${event.device_id}:${event.boot_id}:${event.sequence_no}`,event.id,time,event.data_source==='production'&&meter.source!=='simulation'?'production':'simulation']);
 await db.query('INSERT INTO session_participants(id,usage_session_id,occupancy_id,rfid_card_id,registered_at) VALUES($1,$2,$3,$4,$5)',[randomUUID(),id,occupancy.id,card.id,time]);
 return {action:'opened'};
}
export async function processDevice(pool,deviceId) {
 const db=await pool.connect();
 try {
  await db.query('BEGIN');
  // Same device lock order as receiveTap; facility row locks also serialize different readers.
  const device=(await db.query('SELECT status FROM devices WHERE id=$1 FOR UPDATE',[deviceId])).rows[0];
  const state=(await db.query('SELECT head_event_id FROM rfid_stream_state WHERE device_id=$1 FOR UPDATE',[deviceId])).rows[0];
  if(!state){await db.query('COMMIT');return;}
  let head=state.head_event_id?(await db.query('SELECT * FROM device_events WHERE id=$1',[state.head_event_id])).rows[0]:null;
  for(let n=0;n<100;n++) {
   const candidates=(await db.query(`SELECT * FROM device_events WHERE device_id=$1 AND processing_status='waiting_predecessor'
    AND previous_boot_id IS NOT DISTINCT FROM $2::uuid AND previous_sequence_no IS NOT DISTINCT FROM $3::bigint ORDER BY id`,[deviceId,head?.boot_id||null,head?.sequence_no??null])).rows;
   if(!candidates.length)break;
   if(candidates.length>1){await db.query("UPDATE device_events SET processing_status='review',reason='chain_branch' WHERE id=ANY($1::bigint[])",[candidates.map(e=>e.id)]);break;}
   const event=candidates[0];
   // A boot cannot restart at sequence zero after it has already been consumed.
   const reused=head&&head.boot_id!==event.boot_id && (await db.query("SELECT 1 FROM device_events WHERE device_id=$1 AND boot_id=$2 AND processing_status IN ('processed','rejected') LIMIT 1",[deviceId,event.boot_id])).rowCount;
   if(reused){await db.query("UPDATE device_events SET processing_status='review',reason='boot_reused' WHERE id=$1",[event.id]);break;}
   const outcome=device.status==='active'?await applyTap(db,event):{reason:'inactive_device'};
   await db.query('UPDATE device_events SET processing_status=$2,reason=$3,result_action=$4 WHERE id=$1',[event.id,outcome.action?'processed':'rejected',outcome.reason||null,outcome.action||null]);
   await db.query('UPDATE rfid_stream_state SET head_event_id=$2 WHERE device_id=$1',[deviceId,event.id]);head=event;
  }
  // Late siblings of an already-consumed predecessor must never toggle retroactively.
  await db.query(`UPDATE device_events e SET processing_status='review',reason='chain_branch' WHERE e.device_id=$1 AND e.processing_status='waiting_predecessor'
   AND ((e.previous_boot_id IS NULL AND $2::bigint IS NOT NULL) OR EXISTS(SELECT 1 FROM device_events p WHERE p.device_id=e.device_id AND p.boot_id=e.previous_boot_id
    AND p.sequence_no=e.previous_sequence_no AND p.processing_status IN ('processed','rejected') AND p.id<>$2))`,[deviceId,head?.id||null]);
  await db.query('COMMIT');
 }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{db.release();}
}
export function createRfidWorker(pool,{gap=120}={}) {
 let cursor='00000000-0000-0000-0000-000000000000';
 return async()=>{
  const devices=(await pool.query("SELECT DISTINCT device_id FROM device_events WHERE processing_status='waiting_predecessor' LIMIT 50")).rows;
  for(const {device_id} of devices)await processDevice(pool,device_id);
  await pool.query(`UPDATE usage_sessions s SET status='review',review_reason='participant_or_facility_no_longer_valid'
   FROM session_participants p,occupancies o,rfid_cards c,users u,communal_loads f,meters m
   WHERE p.usage_session_id=s.id AND p.occupancy_id=o.id AND p.rfid_card_id=c.id AND u.id=c.user_id AND f.id=s.communal_load_id AND m.id=s.meter_id
   AND s.ended_at IS NULL AND s.status='active' AND (NOT u.is_active OR NOT f.is_active OR o.ends_at<=now() OR c.revoked_at<=now() OR m.retired_at<=now())`);
  const sessions=(await pool.query('SELECT * FROM usage_sessions WHERE ended_at IS NOT NULL AND id>$1 ORDER BY id LIMIT 25',[cursor])).rows;
  for(const s of sessions){await reconcileSession(pool,s,gap);cursor=s.id;}
  if(sessions.length<25)cursor='00000000-0000-0000-0000-000000000000';
 };
}
