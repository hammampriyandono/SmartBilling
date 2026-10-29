import {dailyConsumption} from './daily-consumption.js';
import {parseDecimal,formatDecimal} from './billing-calculation.js';
import {observationSql} from './display-policy.js';
import {runningRoomCosts} from './billing-running-cost.js';

// A read-only monitoring subtotal. It never writes bill shares or replaces the
// frozen calculation used for final billing. Reuse monitoring's gap/reset rules.
export async function observedPeriodUsage(db,period,query={},maxGapSeconds=120){
 const selected=`SELECT m.*,rm.name room_name,rm.code room_code FROM meters m JOIN rooms rm ON rm.id=m.room_id
  WHERE m.property_id=$1 AND m.kind='room' AND m.installed_at<$3 AND (m.retired_at IS NULL OR m.retired_at>$2)
  ${observationSql(query,['m.id','m.property_id','m.room_id','m.device_id'],['m.source','rm.source'])}
  ${query.data_view==='observation'?`AND NOT EXISTS(SELECT 1 FROM meter_readings sr WHERE sr.meter_id=m.id AND sr.measured_at>=$2 AND sr.measured_at<=$3 AND sr.data_source='simulation')`:''}`;
 const result=await db.query(`WITH selected AS (${selected})
 SELECT m.id meter_id,m.room_id,m.room_name,m.room_code,m.installed_at,m.retired_at,m.source,
 r.id,r.measured_at,r.energy_kwh,r.counter_epoch,r.quality,r.data_source
 FROM selected m LEFT JOIN LATERAL (
  SELECT id,measured_at,energy_kwh,counter_epoch,quality,data_source FROM meter_readings
  WHERE meter_id=m.id AND measured_at>=GREATEST($2::timestamptz,m.installed_at)
   AND measured_at<=LEAST($3::timestamptz,COALESCE(m.retired_at,$3::timestamptz))
  UNION ALL
  (SELECT id,measured_at,energy_kwh,counter_epoch,quality,data_source FROM meter_readings
   WHERE meter_id=m.id AND measured_at<GREATEST($2::timestamptz,m.installed_at)
   ORDER BY measured_at DESC,id DESC LIMIT 1)
 ) r ON true ORDER BY m.room_id,m.id,r.measured_at,r.id LIMIT 100001`,[period.property_id,period.starts_at,period.ends_at]);
 if(result.rows.length>100000)return {availability:'too_many_samples',rooms:[],observed_consumption_kwh:null,max_gap_seconds:maxGapSeconds};
 const meters=new Map();
 for(const row of result.rows){if(!meters.has(row.meter_id))meters.set(row.meter_id,{...row,readings:[]});if(row.id)meters.get(row.meter_id).readings.push(row);}
 const rooms=new Map();let latest=null,samples=0;
 for(const meter of meters.values()){
  const start=new Date(Math.max(+new Date(period.starts_at),+new Date(meter.installed_at))).toISOString();
  const end=new Date(Math.min(+new Date(period.ends_at),meter.retired_at?+new Date(meter.retired_at):Infinity)).toISOString();
  const usage=dailyConsumption([{starts_at:start,ends_at:end}],meter.readings,maxGapSeconds,{includeIntervals:true})[0];
  if(!rooms.has(meter.room_id))rooms.set(meter.room_id,{room_id:meter.room_id,room_name:meter.room_name,room_code:meter.room_code,subtotal:0n,has_intervals:false,sample_count:0,coverage_seconds:0,reasons:new Set(),sources:new Set(),last_measured_at:null,intervals:[]});
  const room=rooms.get(meter.room_id);room.sample_count+=usage.sample_count;room.coverage_seconds+=usage.coverage_seconds;
  room.intervals.push(...usage.valid_intervals);
  if(usage.observed_consumption_kwh!==null){room.subtotal+=parseDecimal(usage.observed_consumption_kwh,9);room.has_intervals=true;}
  for(const reason of usage.reasons)room.reasons.add(reason);
  for(const reading of meter.readings){if(+new Date(reading.measured_at)<+new Date(start))continue;room.sources.add(reading.data_source);if(!room.last_measured_at||+new Date(reading.measured_at)>+new Date(room.last_measured_at))room.last_measured_at=reading.measured_at;}
  if(meter.source==='simulation')room.sources.add('simulation');
 }
 const rows=[...rooms.values()].map(({subtotal,has_intervals,reasons,sources,...room})=>{
  samples+=room.sample_count;if(room.last_measured_at&&(!latest||+new Date(room.last_measured_at)>+new Date(latest)))latest=room.last_measured_at;
  return {...room,observed_consumption_kwh:has_intervals?formatDecimal(subtotal,9):null,status:!room.sample_count?'no_data':reasons.size?'partial':'complete',reasons:[...reasons],data_source:sources.size>1?'mixed':[...sources][0]||'no_data'};
 });
 const known=rows.filter(row=>row.observed_consumption_kwh!==null);
 const context=(await db.query(`SELECT p.timezone,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('id',t.id,'energy_rate_rp_kwh',t.energy_rate_rp_kwh::text,'valid_from',t.valid_from,'valid_until',t.valid_until,'retired_at',t.retired_at,'source',t.source,'source_reference',t.source_reference)) FROM tariff_schedules t WHERE t.property_id=p.id
   AND t.valid_from<$3 AND (t.valid_until IS NULL OR t.valid_until>$2)),'[]'::jsonb) tariffs,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('id',o.id,'room_id',o.room_id,'user_id',o.user_id,'tenant_name',u.name,'starts_at',o.starts_at,'ends_at',o.ends_at,'source',o.source))
   FROM occupancies o JOIN rooms rm ON rm.id=o.room_id JOIN users u ON u.id=o.user_id
   WHERE rm.property_id=p.id AND o.starts_at<$3 AND (o.ends_at IS NULL OR o.ends_at>$2)),'[]'::jsonb) occupancies
  FROM properties p WHERE p.id=$1`,[period.property_id,period.starts_at,period.ends_at])).rows[0]||{};
 const costs=runningRoomCosts(rows,context.tariffs||[],context.occupancies||[]);
 return {availability:known.length?'available':'unavailable',...costs,timezone:context.timezone||'Asia/Jakarta',sample_count:samples,last_measured_at:latest,
  observed_consumption_kwh:known.length?formatDecimal(known.reduce((sum,row)=>sum+parseDecimal(row.observed_consumption_kwh,9),0n),9):null,
  max_gap_seconds:maxGapSeconds,interpolation:false,basis:'valid_intervals_only_not_final_bill'};
}
