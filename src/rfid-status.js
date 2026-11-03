import {Router} from 'express';
import {uuid} from './http-input.js';
import {Rejection} from './sensor-message.js';
import {observationSql} from './display-policy.js';

export const rfidStatusTopic='smartbilling/v1/devices/+/rfid/status';
export function parseRfidStatus(topic,bytes,packet={}) {
 const match=/^smartbilling\/v1\/devices\/([A-Za-z0-9_-]{1,80})\/rfid\/status$/.exec(topic);
 if(!match||bytes.length>1024||packet.qos!==1)throw new Rejection('invalid_rfid_status');
 let p;
 try{p=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new Rejection('invalid_rfid_status');}
 const keys=['schema_version','boot_id','connected','reader_state','ntp_synced','pending_tap','uptime_ms'];
 if(!p||Array.isArray(p)||typeof p!=='object'||Object.keys(p).sort().join()!==keys.sort().join()
  ||p.schema_version!==1||!['ready','unavailable','error','unknown'].includes(p.reader_state)
  ||['connected','ntp_synced','pending_tap'].some(k=>typeof p[k]!=='boolean')
  ||!Number.isInteger(p.uptime_ms)||p.uptime_ms<0||p.uptime_ms>4294967295)throw new Rejection('invalid_rfid_status');
 try{p.boot_id=uuid(p.boot_id);}catch{throw new Rejection('invalid_rfid_status');}
 return {device_uid:match[1],payload:p};
}
export async function receiveRfidStatus(pool,topic,bytes,packet) {
 let parsed;
 try{parsed=parseRfidStatus(topic,bytes,packet);}catch(e){if(e instanceof Rejection)return {status:'rejected',reason:e.message};throw e;}
 const {device_uid,payload:p}=parsed;
 // Retained online messages may be hours old. Wait for a live heartbeat after subscribing.
 if(packet.retain&&p.connected)return {status:'ignored',reason:'retained_online'};
 const q=await pool.query(`INSERT INTO rfid_device_status(device_id,boot_id,connected,reader_state,ntp_synced,pending_tap,uptime_ms)
  SELECT id,$2,$3,$4,$5,$6,$7 FROM devices WHERE device_uid=$1 AND status='active' AND source<>'simulation'
  ON CONFLICT(device_id) DO UPDATE SET boot_id=excluded.boot_id,connected=excluded.connected,
   reader_state=excluded.reader_state,ntp_synced=excluded.ntp_synced,pending_tap=excluded.pending_tap,
   uptime_ms=excluded.uptime_ms,received_at=clock_timestamp() RETURNING device_id`,
 [device_uid,p.boot_id,p.connected,p.reader_state,p.ntp_synced,p.pending_tap,p.uptime_ms]);
 return q.rowCount?{status:'stored'}:{status:'rejected',reason:'unknown_or_inactive_device'};
}
export function rfidConnection(status,now=Date.now()) {
 if(!status.received_at)return 'never_seen';
 if(!status.connected||now-new Date(status.received_at).getTime()>45000)return 'offline';
 return 'online';
}
export function rfidDiagnosticsApi(pool) {
 const r=Router();
 r.get('/owner/rfid-devices',async(req,res)=>{
  if(!req.user)return res.status(401).json({error:'login_required'});
  if(req.user.role!=='owner')return res.status(403).json({error:'owner_required'});
  const q=await pool.query(`SELECT d.id,d.property_id,d.device_uid,d.display_name,d.source,d.status master_status,
   st.connected,st.reader_state,st.ntp_synced,st.pending_tap,st.received_at,
   e.occurred_at last_tap_at,e.received_at last_tap_received_at,e.payload->>'card_uid' last_card_uid,
   e.processing_status last_tap_status,e.reason last_tap_reason,
   CASE WHEN e.id IS NULL THEN NULL ELSE EXISTS(SELECT 1 FROM rfid_cards c
    JOIN users u ON u.id=c.user_id JOIN property_tenants pt ON pt.user_id=u.id
    WHERE pt.property_id=d.property_id AND c.uid=e.payload->>'card_uid' AND u.is_active
    AND c.registered_at<=now() AND (c.revoked_at IS NULL OR c.revoked_at>now())) END card_registered
   FROM devices d JOIN properties p ON p.id=d.property_id
   LEFT JOIN rfid_device_status st ON st.device_id=d.id
   LEFT JOIN LATERAL (SELECT * FROM device_events x WHERE x.device_id=d.id AND x.event_type='rfid_tap'
    ORDER BY x.received_at DESC,x.id DESC LIMIT 1) e ON true
   WHERE p.owner_id=$1 AND (st.device_id IS NOT NULL OR e.id IS NOT NULL
    OR EXISTS(SELECT 1 FROM rfid_readers rr WHERE rr.device_id=d.id))
   ${observationSql(req.query,['d.id','d.property_id'],['d.source'])} ORDER BY d.device_uid LIMIT 100`,[req.user.id]);
  res.json({data:q.rows.map(d=>({...d,connection:rfidConnection(d)})),meta:{heartbeat_seconds:15,offline_seconds:45}});
 });
 return r;
}
