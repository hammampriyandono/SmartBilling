import {Router,json} from 'express';
import {randomUUID,createHmac} from 'node:crypto';
import {HttpError,uuid} from './http-input.js';
import {Rejection} from './sensor-message.js';
import {parseRoomRelayReport,relayFresh,relayWire,RELAY_COMMAND_MS} from './room-relay-protocol.js';

async function transaction(pool,action) {
  const db=await pool.connect();
  try {await db.query('BEGIN');const result=await action(db);await db.query('COMMIT');return result;}
  catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}finally{db.release();}
}
const installationSql=`SELECT m.*,d.device_uid,d.status device_status,d.source device_source,r.name room_name,r.code room_code,r.source room_source,
  NOT EXISTS(SELECT 1 FROM meters other WHERE other.device_id=m.device_id AND other.id<>m.id
    AND other.installed_at<=now() AND (other.retired_at IS NULL OR other.retired_at>now())) single_target
  FROM meters m JOIN devices d ON d.id=m.device_id JOIN rooms r ON r.id=m.room_id JOIN properties p ON p.id=m.property_id
  WHERE m.room_id=$1 AND p.owner_id=$2 AND m.kind='room' AND m.installed_at<=now()
    AND (m.retired_at IS NULL OR m.retired_at>now()) AND r.active_from<=now() AND (r.active_until IS NULL OR r.active_until>now())`;

async function currentInstallation(db,roomId,ownerId,lock=false) {
  const result=await db.query(installationSql+(lock?' FOR SHARE OF m,d,r,p':''),[roomId,ownerId]);
  if(result.rows.length!==1)throw new HttpError(404,'room_relay_installation_not_found');
  return result.rows[0];
}
function readyReason(binding,installation,enabled,now) {
  if(!enabled)return 'relay_control_disabled';
  if(!binding?.enabled)return 'relay_not_commissioned';
  if(!installation.single_target)return 'relay_installation_ambiguous';
  if(installation.device_status!=='active'||[installation.source,installation.device_source,installation.room_source].includes('simulation'))return 'relay_installation_unavailable';
  if(!relayFresh(binding,now)||binding.reported_gpio_level==null)return 'relay_status_stale';
  return null;
}
async function expire(db,bindingId,now) {
  await db.query(`UPDATE room_relay_commands SET status='unconfirmed',result_reason='ack_timeout'
    WHERE binding_id=$1 AND status IN ('queued','sent') AND expires_at<=$2`,[bindingId,new Date(now)]);
}

// Local commissioning utility only; never called automatically or by a tenant.
// Preparation creates a disabled binding. Enabling requires a fresh report and
// an explicit operator declaration after actual GPIO/driver verification.
// This is not contact/voltage feedback from the room's electrical circuit.
export async function configureRoomRelay(pool,{ownerId,roomId,meterId,deviceUid,mode='plan',reason='',rowVersion,hardwareVerified=false,now=Date.now()}) {
  uuid(ownerId);uuid(roomId);uuid(meterId);
  if(!['plan','prepare','enable','disable'].includes(mode)||typeof deviceUid!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(deviceUid))throw new HttpError(400,'invalid_relay_configuration');
  if(mode!=='plan'&&(typeof reason!=='string'||!reason.trim()||reason.length>500))throw new HttpError(400,'relay_reason_required');
  return transaction(pool,async db=>{
    const installation=await currentInstallation(db,roomId,ownerId,true);
    if(installation.id!==meterId||installation.device_uid!==deviceUid)throw new HttpError(409,'relay_target_changed');
    if(!installation.single_target)throw new HttpError(409,'relay_installation_ambiguous');
    if(installation.device_status!=='active'||[installation.source,installation.device_source,installation.room_source].includes('simulation'))throw new HttpError(409,'relay_installation_unavailable');
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`room-relay-binding:${meterId}`]);
    const previous=(await db.query('SELECT * FROM room_relay_bindings WHERE meter_id=$1 FOR UPDATE',[meterId])).rows[0]||null;
    if(mode==='plan'||(mode==='prepare'&&previous))return {changed:false,installation_id:meterId,room_id:roomId,device_uid:deviceUid,binding:previous};
    let binding;
    if(mode==='prepare')binding=(await db.query('INSERT INTO room_relay_bindings(id,meter_id) VALUES($1,$2) RETURNING *',[randomUUID(),meterId])).rows[0];
    else{
      if(!previous||rowVersion!==previous.row_version)throw new HttpError(409,'stale_version');
      if(mode==='enable'){
        if(!hardwareVerified)throw new HttpError(409,'relay_hardware_verification_required');
        if(!relayFresh(previous,now)||previous.reported_gpio_level==null)throw new HttpError(409,'relay_status_stale');
        await expire(db,previous.id,now);
        if((await db.query("SELECT 1 FROM room_relay_commands WHERE binding_id=$1 AND status IN ('queued','sent')",[previous.id])).rowCount)throw new HttpError(409,'relay_command_pending');
      }
      binding=(await db.query('UPDATE room_relay_bindings SET enabled=$2,row_version=row_version+1 WHERE id=$1 RETURNING *',[previous.id,mode==='enable'])).rows[0];
    }
    await db.query(`INSERT INTO audit_logs(property_id,actor_user_id,request_id,action,entity_type,entity_id,before_data,after_data,reason)
      VALUES($1,$2,$3,$4,'room_relay_binding',$5,$6,$7,$8)`,[installation.property_id,ownerId,randomUUID(),`relay_${mode}`,binding.id,previous,binding,reason.trim()]);
    return {changed:true,installation_id:meterId,room_id:roomId,device_uid:deviceUid,binding};
  });
}

export function roomRelayApi(pool,{csrf,idempotencySecret,enabled=false,now=Date.now}={}) {
  const router=Router();router.use(json({limit:'4kb'}));
  const owner=(req,_res,next)=>req.user?.role==='owner'?next():next(new HttpError(403,'owner_required'));
  router.get('/owner/rooms/:roomId/relay',owner,async(req,res)=>{
    const roomId=uuid(req.params.roomId),installation=await currentInstallation(pool,roomId,req.user.id);
    const binding=(await pool.query('SELECT * FROM room_relay_bindings WHERE meter_id=$1',[installation.id])).rows[0]||null;
    const history=binding?(await pool.query(`SELECT * FROM room_relay_commands WHERE binding_id=$1 ORDER BY sequence_no DESC LIMIT 10`,[binding.id])).rows:[];
    const time=now();
    for(const row of history)if(['queued','sent'].includes(row.status)&&+new Date(row.expires_at)<=time){row.status='unconfirmed';row.result_reason='ack_timeout';}
    const reason=readyReason(binding,installation,enabled,time),pending=history.some(c=>['queued','sent'].includes(c.status));
    res.json({data:{room_id:roomId,meter_id:installation.id,room_name:installation.room_name||installation.room_code,
      device_uid:installation.device_uid,binding_id:binding?.id||null,row_version:binding?.row_version||0,
      reported_state:binding?.reported_state||null,last_reported_at:binding?.last_reported_at||null,
      gpio_pin:binding?.reported_gpio_level==null?null:3,gpio_level:binding?.reported_gpio_level??null,
      fresh:relayFresh(binding,time),can_control:!reason&&!pending,blocked_reason:reason||(pending?'relay_command_pending':null),history}});
  });
  router.post('/owner/rooms/:roomId/relay/commands',owner,(req,res,next)=>{
    if(!csrf)return next(new HttpError(503,'csrf_unavailable'));csrf(req,res,next);
  },async(req,res)=>{
    const roomId=uuid(req.params.roomId),key=uuid(req.get('idempotency-key')).toLowerCase(),body=req.body;
    if(!body||Object.keys(body).sort().join(',')!=='desired_state,meter_id,reason,row_version'
      ||!['on','off'].includes(body.desired_state)||typeof body.reason!=='string'||!body.reason.trim()||body.reason.length>500
      ||!Number.isInteger(body.row_version)||body.row_version<1)throw new HttpError(400,'invalid_relay_command');
    uuid(body.meter_id);
    const hash=createHmac('sha256',idempotencySecret).update(JSON.stringify([req.user.id,key,req.method,req.originalUrl,body])).digest('hex');
    const result=await transaction(pool,async db=>{
      const lock=(await db.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) acquired',[`${req.user.id}:${key}`])).rows[0].acquired;
      if(!lock)throw new HttpError(409,'idempotency_in_progress');
      const prior=(await db.query('SELECT * FROM owner_idempotency WHERE owner_id=$1 AND request_key=$2',[req.user.id,key])).rows[0];
      if(prior){if(prior.request_sha256!==hash)throw new HttpError(409,'idempotency_key_conflict');return prior.response_data;}
      const installation=await currentInstallation(db,roomId,req.user.id,true);
      if(installation.id!==body.meter_id)throw new HttpError(409,'stale_version');
      const binding=(await db.query('SELECT * FROM room_relay_bindings WHERE meter_id=$1 FOR UPDATE',[installation.id])).rows[0];
      const time=now(),reason=readyReason(binding,installation,enabled,time);
      if(reason)throw new HttpError(409,reason);
      if(binding.row_version!==body.row_version)throw new HttpError(409,'stale_version');
      await expire(db,binding.id,time);
      if((await db.query("SELECT 1 FROM room_relay_commands WHERE binding_id=$1 AND status IN ('queued','sent')",[binding.id])).rowCount)throw new HttpError(409,'relay_command_pending');
      const command=(await db.query(`INSERT INTO room_relay_commands(id,binding_id,owner_id,target_boot_id,desired_state,reason,issued_at,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[randomUUID(),binding.id,req.user.id,binding.last_boot_id,body.desired_state,body.reason.trim(),new Date(time),new Date(time+RELAY_COMMAND_MS)])).rows[0];
      await db.query('UPDATE room_relay_bindings SET row_version=row_version+1 WHERE id=$1',[binding.id]);
      await db.query(`INSERT INTO audit_logs(property_id,actor_user_id,request_id,action,entity_type,entity_id,before_data,after_data,reason)
        VALUES($1,$2,$3,'request_room_relay','room_relay_command',$6,NULL,$4,$5)`,[installation.property_id,req.user.id,command.id,command,command.reason,command.id]);
      const response={command};
      await db.query('INSERT INTO owner_idempotency(owner_id,request_key,request_sha256,response_data) VALUES($1,$2,$3,$4)',[req.user.id,key,hash,response]);
      return response;
    });
    res.status(202).json({data:result});
  });
  return router;
}

export async function receiveRoomRelayReport(pool,topic,bytes,packet,{now=Date.now()}={}) {
  let report;
  try{report=parseRoomRelayReport(topic,bytes,packet,now);}catch(error){if(error instanceof Rejection)return {status:'rejected',reason:error.message};throw error;}
  return transaction(pool,async db=>{
    const binding=(await db.query(`SELECT b.*,d.device_uid FROM room_relay_bindings b JOIN meters m ON m.id=b.meter_id
      JOIN devices d ON d.id=m.device_id WHERE b.id=$1 AND d.device_uid=$2 AND m.kind='room' AND d.status='active'
      AND m.source<>'simulation' AND d.source<>'simulation' AND m.installed_at<=now() AND (m.retired_at IS NULL OR m.retired_at>now())
      AND NOT EXISTS(SELECT 1 FROM meters other WHERE other.device_id=m.device_id AND other.id<>m.id
        AND other.installed_at<=now() AND (other.retired_at IS NULL OR other.retired_at>now()))
      FOR UPDATE OF b`,[report.binding_id,report.device_uid])).rows[0];
    if(!binding)return {status:'rejected',reason:'unregistered_relay'};
    const reportTime=Date.parse(report.reported_at),lastTime=+new Date(binding.last_reported_at);
    const newer=!binding.last_reported_at||reportTime>lastTime||(reportTime===lastTime&&binding.last_boot_id===report.boot_id&&report.report_sequence>Number(binding.last_report_sequence));
    const sequenceOk=binding.last_boot_id!==report.boot_id||report.report_sequence>Number(binding.last_report_sequence);
    if(report.result==='status'&&(!newer||!sequenceOk))return {status:'duplicate'};
    if(report.result!=='status'){
      const command=(await db.query('SELECT * FROM room_relay_commands WHERE id=$1 AND binding_id=$2 FOR UPDATE',[report.command_id,binding.id])).rows[0];
      const wrongBootRejection=report.result==='rejected'&&report.reason==='wrong_boot'&&command?.target_boot_id!==report.boot_id;
      if(!command||String(command.sequence_no)!==report.command_sequence||(command.target_boot_id!==report.boot_id&&!wrongBootRejection)
        ||Date.parse(report.reported_at)<+new Date(command.issued_at)-5000
        ||(report.result==='applied'&&Date.parse(report.reported_at)>+new Date(command.expires_at))
        ||(report.result==='applied'&&command.desired_state!==report.state))return {status:'rejected',reason:'relay_ack_mismatch'};
      if(['queued','sent','unconfirmed'].includes(command.status))await db.query(`UPDATE room_relay_commands SET status=$2,confirmed_at=$3,result_reason=$4 WHERE id=$1`,
        [command.id,report.result==='applied'?'confirmed':'rejected',report.reported_at,report.reason]);
    }
    // A delayed acknowledgment may settle its historical command, but cannot
    // overwrite a newer heartbeat or make an old boot appear online again.
    if(newer&&sequenceOk)await db.query(`UPDATE room_relay_bindings SET last_boot_id=$2,last_report_sequence=$3,last_reported_at=$4,last_received_at=$5,
      reported_state=$6,reported_gpio_level=$7,row_version=row_version+1 WHERE id=$1`,[binding.id,report.boot_id,report.report_sequence,report.reported_at,new Date(now),report.state,report.gpio_level]);
    return {status:'accepted'};
  });
}

// Database outbox. A broker PUBACK never confirms the relay. Duplicate wire
// deliveries retain ID/sequence/expiry; firmware must reject expired/old commands.
export function createRoomRelayWorker(pool,mqtt,{enabled=false,now=Date.now}={}) {
  return async()=>{
    if(!enabled)return;
    const time=now();
    await pool.query(`UPDATE room_relay_commands SET status='unconfirmed',result_reason='ack_timeout'
      WHERE status IN ('queued','sent') AND expires_at<=$1`,[new Date(time)]);
    if(!mqtt.connected)return;
    await transaction(pool,async db=>{
      const commands=(await db.query(`SELECT c.*,d.device_uid FROM room_relay_commands c
        JOIN room_relay_bindings b ON b.id=c.binding_id JOIN meters m ON m.id=b.meter_id JOIN devices d ON d.id=m.device_id
        JOIN rooms r ON r.id=m.room_id JOIN properties p ON p.id=m.property_id
        WHERE c.status IN ('queued','sent') AND c.expires_at>$1 AND b.enabled=true AND d.status='active'
        AND m.source<>'simulation' AND d.source<>'simulation' AND r.source<>'simulation' AND p.owner_id=c.owner_id
        AND m.installed_at<=$1 AND (m.retired_at IS NULL OR m.retired_at>$1) AND r.active_from<=$1 AND (r.active_until IS NULL OR r.active_until>$1)
        AND NOT EXISTS(SELECT 1 FROM meters other WHERE other.device_id=m.device_id AND other.id<>m.id
          AND other.installed_at<=$1 AND (other.retired_at IS NULL OR other.retired_at>$1))
        AND c.target_boot_id=b.last_boot_id AND b.reported_gpio_level IS NOT NULL AND b.last_reported_at>=$1::timestamptz-interval '30 seconds'
        AND b.last_reported_at<=$1::timestamptz+interval '5 seconds' AND b.last_received_at>=$1::timestamptz-interval '30 seconds'
        AND (c.publish_attempted_at IS NULL OR c.publish_attempted_at<=$1::timestamptz-interval '3 seconds')
        ORDER BY c.sequence_no LIMIT 10 FOR UPDATE OF b,c SKIP LOCKED FOR SHARE OF m,d,r,p`,[new Date(time)])).rows;
      for(const command of commands){
        await db.query("UPDATE room_relay_commands SET status='sent',publish_attempted_at=$2 WHERE id=$1",[command.id,new Date(time)]);
        // Do not await PUBACK while holding an incoming MQTT acknowledgment.
        mqtt.publish(`smartbilling/v1/devices/${command.device_uid}/relay/commands`,JSON.stringify(relayWire(command)),
          {qos:1,retain:false},()=>{});
      }
    });
  };
}
