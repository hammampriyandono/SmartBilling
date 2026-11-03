import {parseDecimal,formatDecimal} from './billing-calculation.js';
import {intervalPrice,distributeRoundedCost,money} from './billing-running-cost.js';
import {comparisonTiming} from './meter-comparison.js';
import {observationSql} from './display-policy.js';

export const sharedRule='equal_active_occupants_v1';
export const sharedSampleLimit=250000; // Monthly minute samples: main + rooms + RFID.
export const sharedEnabled=period=>period.policy_snapshot?.shared_allocation===sharedRule;
const time=v=>+new Date(v),iso=v=>new Date(v).toISOString(),energy=v=>formatDecimal(v,9);
const overlaps=(o,a,b)=>time(o.starts_at)<b&&(!o.ends_at||time(o.ends_at)>a);
const covers=(o,a,b)=>time(o.starts_at)<=a&&(!o.ends_at||time(o.ends_at)>=b);
const badSource=v=>['simulation','mixed'].includes(v);

// Residuals are accumulated over a continuous run before checking their sign.
// Dropping negative one-minute residuals would bias charges at Wh resolution.
export function sharedUsage({meters=[],rooms=[],readings=[],occupancies=[],tariffs=[],period,policy=period.policy_snapshot||{}}){
 const out={rule:sharedRule,status:'unavailable',energy_kwh:null,estimated_cost_rp:null,allocations:[],runs:[],reasons:[],pricing:[],coverage_seconds:0,complete:false,room_energy:[],basis:'main_minus_rooms_minus_attributable',interpolation:false};
 const reasons=new Set(),main=meters.filter(m=>m.kind==='main'),roomMeters=meters.filter(m=>m.kind==='room');
 const required=meters.filter(m=>m.main_meter_coverage!=='outside'&&(m.kind!=='communal'||m.load_type==='attributable'));
 if(main.length!==1||!rooms.length||rooms.some(r=>roomMeters.filter(m=>m.room_id===r.id).length!==1)||roomMeters.length!==rooms.length){out.reasons=['shared_mapping_incomplete'];return out;}
 if(required.some(m=>badSource(m.source))){out.reasons=['simulation_not_finalizable'];return out;}
 const bySlot=new Map(),byId=new Map(required.map(m=>[m.id,m]));
 for(const r of readings){
  const at=time(r.measured_at),m=byId.get(r.meter_id);if(!m||at<time(period.starts_at)||at>time(period.ends_at)||at<time(m.installed_at)||(m.retired_at&&at>time(m.retired_at)))continue;
  const slot=Math.floor(at/comparisonTiming.interval_ms)*comparisonTiming.interval_ms;
  if(at-slot>comparisonTiming.max_offset_ms)continue;
  if(!bySlot.has(slot))bySlot.set(slot,new Map());const map=bySlot.get(slot);if(!map.has(m.id))map.set(m.id,[]);map.get(m.id).push(r);
 }
 const rounds=[];
 for(const [slot,map] of [...bySlot].sort((a,b)=>a[0]-b[0])){
  const rows=required.map(m=>map.get(m.id));
  if(rows.some(a=>a?.length!==1)){reasons.add('shared_round_incomplete');continue;}
  const picked=rows.map(a=>a[0]);
  if(picked.some(r=>r.quality!=='valid'||r.data_source!=='production'||r.energy_kwh==null)){reasons.add('shared_invalid_reading');continue;}
  const dates=picked.map(r=>time(r.measured_at));if(Math.max(...dates)-Math.min(...dates)>comparisonTiming.max_spread_ms){reasons.add('shared_time_mismatch');continue;}
  rounds.push({slot,rows:picked,from:Math.min(...dates),to:Math.max(...dates)});
 }
 const runs=[];let active=null;
 if(rounds.length<2)reasons.add('shared_insufficient_rounds');
 for(let i=1;i<rounds.length;i++){
  const a=rounds[i-1],b=rounds[i],start=a.from,end=b.to;
  if(b.slot-a.slot!==60000){active=null;reasons.add('shared_gap');continue;}
  if(policy.production_max_gap_seconds==null||b.rows.some((r,j)=>(time(r.measured_at)-time(a.rows[j].measured_at))/1000>policy.production_max_gap_seconds)){active=null;reasons.add(policy.production_max_gap_seconds==null?'gap_policy_unset':'shared_gap');continue;}
  let deltas;
  try{deltas=b.rows.map((r,j)=>{const prior=a.rows[j];if(r.counter_epoch!==prior.counter_epoch)throw Error('counter_reset');const d=parseDecimal(String(r.energy_kwh),9)-parseDecimal(String(prior.energy_kwh),9);if(d<0n)throw Error('counter_decreased');return d;});}
  catch(e){active=null;reasons.add(e.message);continue;}
  const present=occupancies.filter(o=>overlaps(o,start,end)).sort((a,b)=>a.id.localeCompare(b.id));
  if(!present.length||present.some(o=>!covers(o,start,end)||badSource(o.source))||new Set(present.map(o=>o.user_id)).size!==present.length){active=null;reasons.add(present.length?'shared_occupancy_boundary':'shared_no_active_occupants');continue;}
  const price=intervalPrice({starts_at:iso(start),ends_at:iso(end)},tariffs);
  if(price.rate===null){active=null;reasons.add(price.issue);continue;}
  const signature=JSON.stringify([present.map(o=>o.id),price.basis]);
  if(!active||active.signature!==signature||active.lastSlot!==a.slot){active={signature,first:a,last:b,lastSlot:b.slot,people:present,price,deltas:required.map(()=>0n),intervals:0};runs.push(active);}
  active.last=b;active.lastSlot=b.slot;active.intervals++;deltas.forEach((d,j)=>active.deltas[j]+=d);
 }
 let total=0n,rawCost=0n;const buckets=new Map(),roomTotals=new Map(),pricing=new Map();
 let negative=false;
 for(const run of runs){
  const mainIndex=required.findIndex(m=>m.kind==='main'),residual=run.deltas[mainIndex]-run.deltas.reduce((sum,d,j)=>sum+(j===mainIndex?0n:d),0n);
  const evidence={starts_at:iso(run.first.from),ends_at:iso(run.last.to),start_round_at:iso(run.first.slot),end_round_at:iso(run.last.slot),interval_count:run.intervals,recipient_count:run.people.length,main_energy_kwh:energy(run.deltas[mainIndex]),shared_energy_kwh:residual<0n?null:energy(residual),meters:required.map((m,j)=>({meter_id:m.id,kind:m.kind,room_id:m.room_id??null,energy_kwh:energy(run.deltas[j]),start_reading_id:run.first.rows[j].id,end_reading_id:run.last.rows[j].id,measured_starts_at:run.first.rows[j].measured_at,measured_ends_at:run.last.rows[j].measured_at}))};
  out.runs.push(evidence);out.coverage_seconds+=run.intervals*60;
  if(residual<0n){negative=true;reasons.add('negative_property_residual');continue;}
  total+=residual;const rate=parseDecimal(run.price.rate,12);rawCost+=residual*rate;pricing.set(JSON.stringify(run.price.basis),run.price.basis);
  required.forEach((m,j)=>{if(m.kind==='room')roomTotals.set(m.room_id,(roomTotals.get(m.room_id)||0n)+run.deltas[j]);});
  const n=BigInt(run.people.length),base=residual/n,remainder=residual%n;
  run.people.forEach((o,j)=>{const part=base+(BigInt(j)<remainder?1n:0n);if(!buckets.has(o.id))buckets.set(o.id,{key:o.id,kind:'tenant',occupancy_id:o.id,tenant_id:o.user_id,tenant_name:o.tenant_name,room_id:o.room_id,energy:0n,raw:0n});const bucket=buckets.get(o.id);bucket.energy+=part;bucket.raw+=part*rate;});
 }
 out.reasons=[...reasons];out.pricing=[...pricing.values()];
 if(!runs.length||negative)return {...out,status:negative?'review':'unavailable'};
 const costs=distributeRoundedCost([...buckets.values()]);
 out.energy_kwh=energy(total);out.estimated_cost_rp=String(money(rawCost));out.allocations=[...buckets.values()].map(({key,energy:e,raw,...part})=>({...part,energy_kwh:energy(e),estimated_cost_rp:costs.get(key)}));
 out.room_energy=[...roomTotals].map(([room_id,e])=>({room_id,energy_kwh:energy(e)}));
 const first=runs[0].first,last=runs.at(-1).last,tolerance=policy.boundary_method==='inside'?(policy.boundary_tolerance_seconds??0)*1000:0;
 // Final billing requires one continuous run, within the selected boundary
 // tolerance, and matching room totals. Live subtotals may have several runs.
 out.complete=runs.length===1&&first.from>=time(period.starts_at)&&first.to-time(period.starts_at)<=tolerance&&time(period.ends_at)-last.from<=tolerance&&last.to<=time(period.ends_at);
 out.status=out.complete?'complete':'partial';return out;
}

export async function observedSharedUsage(db,period,tariffs,occupancies){
 const args=[period.property_id,period.starts_at,period.ends_at];
 const rooms=(await db.query(`SELECT rm.id FROM rooms rm WHERE rm.property_id=$1 AND rm.active_from<$3 AND (rm.active_until IS NULL OR rm.active_until>$2) ${observationSql({data_view:'observation'},['rm.id','rm.property_id'],['rm.source'])}`,args)).rows;
 const meters=(await db.query(`SELECT m.*,c.load_type FROM meters m JOIN devices d ON d.id=m.device_id LEFT JOIN communal_loads c ON c.id=m.communal_load_id WHERE m.property_id=$1 AND m.installed_at<$3 AND (m.retired_at IS NULL OR m.retired_at>$2) ${observationSql({data_view:'observation'},['m.id','m.room_id','m.device_id','m.communal_load_id'],['m.source','d.source','c.source'])}`,args)).rows;
 const readings=(await db.query(`SELECT r.id::text,r.meter_id,r.measured_at,r.energy_kwh::text,r.counter_epoch,r.quality,r.data_source FROM meter_readings r JOIN meters m ON m.id=r.meter_id WHERE m.property_id=$1 AND r.measured_at>=$2 AND r.measured_at<=$3 ORDER BY r.measured_at,r.id LIMIT ${sharedSampleLimit+1}`,args)).rows;
 if(readings.length>sharedSampleLimit)return {rule:sharedRule,status:'unavailable',energy_kwh:null,estimated_cost_rp:null,allocations:[],runs:[],room_energy:[],pricing:[],coverage_seconds:0,complete:false,reasons:['too_many_samples']};
 return sharedUsage({period,meters,rooms,readings,tariffs,occupancies});
}
