import {parseDecimal,formatDecimal} from './billing-calculation.js';
import {observationSql} from './display-policy.js';

export const comparisonTiming=Object.freeze({interval_ms:60000,max_offset_ms:2000,max_spread_ms:1000,max_age_ms:120000});
const time=value=>+new Date(value);
const fields=['id','measured_at','received_at','voltage_v','current_a','power_w','energy_kwh','counter_epoch'];
const project=row=>row?Object.fromEntries(fields.map(k=>[k,row[k]??null])):null;
function eligible(row,slot,now){const at=time(row.measured_at);return row.quality==='valid'&&row.data_source==='production'&&Number.isFinite(at)&&at>=slot&&at<=slot+comparisonTiming.max_offset_ms&&at<=now;}
function one(meter,slot,now){const rows=(meter.readings||[]).filter(r=>eligible(r,slot,now));return rows.length===1?rows[0]:null;}
function sum(rows,key,scale){if(!rows.length||rows.some(r=>r?.[key]==null))return null;try{return formatDecimal(rows.reduce((v,r)=>v+parseDecimal(String(r[key]),scale),0n),scale);}catch{return null;}}
function difference(a,b,scale){if(a==null||b==null)return null;const delta=parseDecimal(a,scale)-parseDecimal(b,scale);return (delta<0n?'-':'')+formatDecimal(delta<0n?-delta:delta,scale);}

// A comparison is a set of actual samples, not interpolated or rounded values.
// A minute with duplicate eligible readings is ambiguous and is not selected.
export function compareMeterReadings(meters,now=Date.now()){
 meters=meters.filter(m=>m.main_meter_coverage!=='outside');
 const timing=comparisonTiming,current=Math.floor(now/timing.interval_ms)*timing.interval_ms;
 const result={status:'waiting',round_at:null,pending_round_at:new Date(current).toISOString(),timing,
  spread_ms:null,age_ms:null,meters:[],power:null,energy:null,scope:'registered_branches_only',interpolation:false};
 let slot=null,readings=null;
 const validMapping=meters.filter(m=>m.kind==='main').length===1&&meters.some(m=>m.kind!=='main');
 if(validMapping)for(let candidate=current;candidate>=current-timing.max_age_ms;candidate-=timing.interval_ms){
  const picked=meters.map(m=>one(m,candidate,now));if(picked.some(r=>!r))continue;
  const timestamps=picked.map(r=>time(r.measured_at)),spread=Math.max(...timestamps)-Math.min(...timestamps);
  if(spread>timing.max_spread_ms||now-Math.max(...timestamps)>timing.max_age_ms)continue;
  slot=candidate;readings=picked;result.spread_ms=spread;result.age_ms=now-Math.max(...timestamps);break;
 }
 if(!validMapping)result.status='incomplete_mapping';
 else if(slot===null&&meters.some(m=>m.latest_reading&&now-time(m.latest_reading.measured_at)>timing.max_age_ms))result.status='stale';
 else if(slot===null&&meters.every(m=>m.latest_reading))result.status='unsynchronized';
 if(slot!==null){result.status=slot===current?'aligned':'waiting';result.round_at=new Date(slot).toISOString();}
 const previous=slot===null?null:meters.map(m=>one(m,slot-timing.interval_ms,now));
 let previousAligned=previous&&previous.every(Boolean);
 if(previousAligned){const timestamps=previous.map(r=>time(r.measured_at));previousAligned=Math.max(...timestamps)-Math.min(...timestamps)<=timing.max_spread_ms;}
 result.meters=meters.map((m,i)=>{
  const reading=readings?.[i]??null,prior=previousAligned?previous[i]:null;
  let delta=null;
  if(reading&&prior&&reading.counter_epoch===prior.counter_epoch&&reading.energy_kwh!=null&&prior.energy_kwh!=null){
   try{const value=parseDecimal(String(reading.energy_kwh),9)-parseDecimal(String(prior.energy_kwh),9);if(value>=0n)delta=formatDecimal(value,9);}catch{}
  }
  return {id:m.id,kind:m.kind,label:m.kind==='main'?'Meter utama':m.room_name||m.room_code||m.facility_name||'Meter komunal',
   latest_measured_at:m.latest_reading?.measured_at??null,reading:project(reading),delta_kwh:delta,
   delta_starts_at:delta!==null?prior.measured_at:null,delta_ends_at:delta!==null?reading.measured_at:null};
 });
 if(readings){
  const mainIndex=meters.findIndex(m=>m.kind==='main'),branches=readings.filter((_r,i)=>i!==mainIndex);
  const main=sum([readings[mainIndex]],'power_w',6),branch=sum(branches,'power_w',6);
  result.power={main_w:main,registered_branches_w:branch,difference_w:difference(main,branch,6)};
  const mainEnergy=sum([result.meters[mainIndex]],'delta_kwh',9),branchEnergy=sum(result.meters.filter((_m,i)=>i!==mainIndex),'delta_kwh',9);
  result.energy={starts_at:previousAligned?new Date(slot-timing.interval_ms).toISOString():null,ends_at:result.round_at,
   main_delta_kwh:mainEnergy,registered_branches_delta_kwh:branchEnergy,difference_kwh:difference(mainEnergy,branchEnergy,9)};
 }
 return result;
}

export async function meterComparison(db,{ownerId,propertyId,at=new Date()}){
 const property=(await db.query('SELECT id,timezone FROM properties WHERE id=$1 AND owner_id=$2',[propertyId,ownerId])).rows[0];
 if(!property)return null;
 const end=new Date(at),start=new Date(+end-3*comparisonTiming.interval_ms);
 const result=await db.query(`SELECT m.id,m.kind,m.main_meter_coverage,rm.name room_name,rm.code room_code,c.name facility_name,
  latest.reading latest_reading,COALESCE(samples.readings,'[]'::jsonb) readings
  FROM meters m JOIN properties p ON p.id=m.property_id JOIN devices d ON d.id=m.device_id
  LEFT JOIN rooms rm ON rm.id=m.room_id LEFT JOIN communal_loads c ON c.id=m.communal_load_id
  LEFT JOIN LATERAL (SELECT to_jsonb(r) reading FROM (SELECT id::text,measured_at,received_at,voltage_v::text,current_a::text,power_w::text,energy_kwh::text,counter_epoch,quality,data_source FROM meter_readings
   WHERE meter_id=m.id ORDER BY measured_at DESC,id DESC LIMIT 1) r) latest ON true
  LEFT JOIN LATERAL (SELECT jsonb_agg(r ORDER BY r.measured_at,r.id) readings FROM (SELECT id::text,measured_at,received_at,voltage_v::text,current_a::text,power_w::text,energy_kwh::text,counter_epoch,quality,data_source FROM meter_readings
   WHERE meter_id=m.id AND measured_at>=$3 AND measured_at<=$4 ORDER BY measured_at DESC,id DESC LIMIT 12) r) samples ON true
  WHERE m.property_id=$1 AND p.owner_id=$2 AND m.installed_at<=$4 AND (m.retired_at IS NULL OR m.retired_at>$4)
   ${observationSql({data_view:'observation'},['m.id','m.property_id','m.device_id','m.room_id','m.communal_load_id'],['m.source','d.source','rm.source','c.source'])}
  ORDER BY m.kind,m.room_id,m.id`,[propertyId,ownerId,start.toISOString(),end.toISOString()]);
 return {...compareMeterReadings(result.rows,+end),property_id:property.id,timezone:property.timezone,checked_at:end.toISOString()};
}
