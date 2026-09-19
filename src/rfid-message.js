import {uuid,timestamp} from './http-input.js';
import {Rejection} from './sensor-message.js';
export const rfidTopic='smartbilling/sim/v1/devices/+/rfid/taps';
export function parseTap(topic,bytes,packet={}) {
 if(bytes.length>4096) throw new Rejection('payload_too_large');
 if(packet.retain) throw new Rejection('retained_not_allowed');
 if(packet.qos!==1) throw new Rejection('invalid_qos');
 const match=/^smartbilling\/sim\/v1\/devices\/([A-Za-z0-9_-]{1,80})\/rfid\/taps$/.exec(topic);
 if(!match)throw new Rejection('invalid_topic');
 let v;
 try {v=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new Rejection('invalid_json');}
 const keys=['schema_version','boot_id','sequence_no','previous_event','reader_channel','card_uid','occurred_at'];
 if(!v||Array.isArray(v)||typeof v!=='object'||Object.keys(v).length!==keys.length||Object.keys(v).some(k=>!keys.includes(k)))throw new Rejection('invalid_fields');
 if(v.schema_version!==1 || !Number.isSafeInteger(v.sequence_no)||v.sequence_no<0 || !Number.isInteger(v.reader_channel)||v.reader_channel<0||v.reader_channel>2147483647
  || typeof v.card_uid!=='string'||!/^([0-9A-F]{8}|[0-9A-F]{14}|[0-9A-F]{20})$/.test(v.card_uid))throw new Rejection('invalid_tap');
 try {
  const boot=uuid(v.boot_id).toLowerCase(), occurred=timestamp(v.occurred_at);let previous=null;
  if(v.previous_event!==null){const p=v.previous_event;
   if(!p||Array.isArray(p)||Object.keys(p).sort().join(',')!=='boot_id,sequence_no'||!Number.isSafeInteger(p.sequence_no)||p.sequence_no<0)throw new Error();
   previous={boot_id:uuid(p.boot_id).toLowerCase(),sequence_no:p.sequence_no};
   if(previous.boot_id===boot ? v.sequence_no!==previous.sequence_no+1 : v.sequence_no!==0)throw new Error();
  } else if(v.sequence_no!==0)throw new Error();
  return {device_uid:match[1],payload:{schema_version:1,boot_id:boot,sequence_no:v.sequence_no,previous_event:previous,reader_channel:v.reader_channel,card_uid:v.card_uid,occurred_at:occurred}};
 }catch{throw new Rejection('invalid_identity_or_time');}
}
