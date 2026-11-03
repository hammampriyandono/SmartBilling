import {uuid,timestamp} from './http-input.js';
import {Rejection} from './sensor-message.js';

export const roomRelayStatusTopic='smartbilling/v1/devices/+/relay/status';
export const RELAY_FRESH_MS=30000;
export const RELAY_COMMAND_MS=15000;
const fields=['schema_version','binding_id','boot_id','report_sequence','reported_at','state','gpio_pin','gpio_level','command_id','command_sequence','result','reason'];
const reasons=['expired','wrong_boot','superseded','relay_unavailable'];

// A report acknowledges the GPIO/driver state, not a voltage or contact measurement.
export function parseRoomRelayReport(topic,bytes,packet={},now=Date.now()) {
  if(bytes.length>2048)throw new Rejection('payload_too_large');
  if(packet.retain||packet.qos!==1)throw new Rejection('invalid_relay_delivery');
  const match=/^smartbilling\/v1\/devices\/([A-Za-z0-9_-]{1,80})\/relay\/status$/.exec(topic);
  if(!match)throw new Rejection('invalid_relay_topic');
  let p;
  try {p=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new Rejection('invalid_json');}
  if(!p||Array.isArray(p)||typeof p!=='object'||Object.keys(p).length!==fields.length||fields.some(k=>!Object.hasOwn(p,k)))throw new Rejection('invalid_relay_fields');
  try {
    p.binding_id=uuid(p.binding_id).toLowerCase();p.boot_id=uuid(p.boot_id).toLowerCase();
    p.reported_at=timestamp(p.reported_at);
    if(!Number.isSafeInteger(p.report_sequence)||p.report_sequence<0||p.gpio_pin!==3||![0,1].includes(p.gpio_level)
      ||p.state!==(p.gpio_level===1?'on':'off'))throw new Error();
    const age=now-Date.parse(p.reported_at);
    if(age< -5000||age>RELAY_FRESH_MS)throw new Error();
    if(p.result==='status') {
      if(p.command_id!==null||p.command_sequence!==null||p.reason!==null)throw new Error();
    } else {
      p.command_id=uuid(p.command_id).toLowerCase();
      if(typeof p.command_sequence!=='string'||! /^[1-9]\d{0,18}$/.test(p.command_sequence)||BigInt(p.command_sequence)>9223372036854775807n)throw new Error();
      if(p.result==='applied'){if(p.reason!==null)throw new Error();}
      else if(p.result!=='rejected'||!reasons.includes(p.reason))throw new Error();
    }
  }catch{throw new Rejection('invalid_relay_report');}
  return {device_uid:match[1],...p};
}

export function relayFresh(binding,now=Date.now()) {
  const age=now-Date.parse(binding?.last_reported_at),receivedAge=now-Date.parse(binding?.last_received_at);
  return Number.isFinite(age)&&age>= -5000&&age<=RELAY_FRESH_MS&&receivedAge>=0&&receivedAge<=RELAY_FRESH_MS;
}

export function relayWire(command) {
  return {schema_version:1,command_id:command.id,binding_id:command.binding_id,sequence_no:String(command.sequence_no),
    target_boot_id:command.target_boot_id,desired_state:command.desired_state,
    issued_at:new Date(command.issued_at).toISOString(),expires_at:new Date(command.expires_at).toISOString()};
}
