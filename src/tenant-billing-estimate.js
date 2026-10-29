import {HttpError} from './http-input.js';
import {billingObservationSql,observationSql} from './display-policy.js';
import {observedPeriodUsage} from './billing-observed.js';
import {parseDecimal,formatDecimal} from './billing-calculation.js';

const access=`EXISTS(SELECT 1 FROM occupancies own JOIN rooms own_room ON own_room.id=own.room_id
 WHERE own.user_id=$1 AND own_room.property_id=bp.property_id AND own.starts_at<=now()
 AND own.starts_at<bp.ends_at AND (own.ends_at IS NULL OR own.ends_at>bp.starts_at))`;

export async function tenantEstimatePeriods(db,userId,query={},size=100,after=null){
 const result=await db.query(`SELECT bp.id,bp.starts_at,bp.ends_at,bp.revision_no,p.timezone
 FROM billing_periods bp JOIN properties p ON p.id=bp.property_id
 WHERE bp.status IN ('draft','review') AND ${access} ${billingObservationSql(query)}
 AND ($2::uuid IS NULL OR bp.id>$2) ORDER BY bp.id LIMIT $3`,[userId,after,size+1]);
 return {data:result.rows.slice(0,size),next_after:result.rows.length>size?result.rows[size-1].id:null};
}

// Compute the same rounded allocation as the owner, then explicitly project only
// this account's parts. No property totals, other occupants or raw counters leave
// this function; even sample counts/last-seen come from occupancy-scoped SQL.
export function projectTenantEstimate(period,usage,occupancies,stats){
 const ownIds=new Set(occupancies.map(row=>row.id)),rooms=new Map();
 for(const occupancy of occupancies){
  if(!rooms.has(occupancy.room_id))rooms.set(occupancy.room_id,{room_id:occupancy.room_id,room_name:occupancy.room_name,room_code:occupancy.room_code,parts:[]});
 }
 for(const room of usage.rooms||[])for(const part of room.allocations||[]){
  if(part.kind==='tenant'&&ownIds.has(part.occupancy_id)&&rooms.has(room.room_id))rooms.get(room.room_id).parts.push(part);
 }
 const rows=[...rooms.values()].map(({parts,...room})=>{
  const snapshot=stats.find(row=>row.room_id===room.room_id),count=snapshot?.sample_count||0;
  const energy=parts.length?formatDecimal(parts.reduce((sum,part)=>sum+parseDecimal(part.energy_kwh,9),0n),9):null;
  const cost=parts.length&&parts.every(part=>part.estimated_cost_rp!==null)?String(parts.reduce((sum,part)=>sum+BigInt(part.estimated_cost_rp),0n)):null;
  return {...room,energy_kwh:energy,estimated_cost_rp:cost,sample_count:count,last_measured_at:snapshot?.last_measured_at||null,
   data_source:snapshot?.data_source||'no_data',availability:cost!==null?'available':count>=2?'review':'unavailable',
   reason:usage.availability==='too_many_samples'?'too_many_samples':parts.length&&cost===null?'pricing_unavailable':!parts.length&&count>=2?'allocation_pending':!parts.length?'insufficient_readings':null};
 });
 const known=rows.filter(row=>row.energy_kwh!==null),last=rows.map(row=>row.last_measured_at).filter(Boolean).sort((a,b)=>+new Date(b)-+new Date(a))[0]||null;
 return {period_id:period.id,starts_at:period.starts_at,ends_at:period.ends_at,revision_no:period.revision_no,
  timezone:period.timezone||usage.timezone||'Asia/Jakarta',status:'estimate',basis:'own_allocated_room_intervals',
  estimated_cost_rp:rows.length&&rows.every(row=>row.estimated_cost_rp!==null)?String(rows.reduce((sum,row)=>sum+BigInt(row.estimated_cost_rp),0n)):null,
  energy_kwh:known.length?formatDecimal(known.reduce((sum,row)=>sum+parseDecimal(row.energy_kwh,9),0n),9):null,
  sample_count:rows.reduce((sum,row)=>sum+row.sample_count,0),last_measured_at:last,rooms:rows,
  components_included:['room'],excluded_components:['communal_rfid','shared']};
}

export async function tenantRunningEstimate(db,id,userId,query={},maxGapSeconds=120){
 const period=(await db.query(`SELECT bp.*,p.timezone FROM billing_periods bp JOIN properties p ON p.id=bp.property_id
 WHERE ${access} AND bp.id=$2 AND bp.status IN ('draft','review') ${billingObservationSql(query)}`,[userId,id])).rows[0];
 if(!period)throw new HttpError(404,'billing_estimate_not_found');
 const occupancies=(await db.query(`SELECT o.id,o.room_id,rm.name room_name,rm.code room_code FROM occupancies o JOIN rooms rm ON rm.id=o.room_id
 WHERE o.user_id=$1 AND rm.property_id=$2 AND o.starts_at<=now() AND o.starts_at<$4 AND (o.ends_at IS NULL OR o.ends_at>$3)
 ${observationSql(query,['o.id','o.user_id','o.room_id'],['o.source','rm.source'])}`,[userId,period.property_id,period.starts_at,period.ends_at])).rows;
 if(!occupancies.length)throw new HttpError(404,'billing_estimate_not_found');
 const usage=await observedPeriodUsage(db,period,query,maxGapSeconds);
 const stats=(await db.query(`SELECT m.room_id,count(DISTINCT mr.id)::int sample_count,max(mr.measured_at) last_measured_at,
 CASE WHEN bool_or(mr.data_source='simulation') AND bool_or(mr.data_source='production') THEN 'mixed'
  WHEN bool_or(mr.data_source='simulation') THEN 'simulation' ELSE 'production' END data_source
 FROM meter_readings mr JOIN meters m ON m.id=mr.meter_id JOIN occupancies o ON o.room_id=m.room_id JOIN rooms rm ON rm.id=m.room_id
 WHERE o.user_id=$1 AND m.property_id=$2 AND m.kind='room' AND o.starts_at<=now()
 AND mr.measured_at>=$3 AND mr.measured_at<=$4 AND mr.measured_at>=o.starts_at AND (o.ends_at IS NULL OR mr.measured_at<o.ends_at)
 AND mr.measured_at>=m.installed_at AND (m.retired_at IS NULL OR mr.measured_at<=m.retired_at)
 ${observationSql(query,['m.id','m.room_id','m.device_id','o.id','o.user_id'],['m.source','rm.source','o.source'])}
 GROUP BY m.room_id`,[userId,period.property_id,period.starts_at,period.ends_at])).rows;
 return projectTenantEstimate(period,usage,occupancies,stats);
}
