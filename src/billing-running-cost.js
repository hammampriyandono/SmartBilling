import {parseDecimal,formatDecimal} from './billing-calculation.js';
import {defaultExpoEstimate} from './token-summary.js';

const costScale=10n**21n;
const overlaps=(row,interval,startKey,endKey)=>+new Date(row[startKey])<+new Date(interval.ends_at)&&(!row[endKey]||+new Date(row[endKey])>+new Date(interval.starts_at));
const covers=(row,interval,startKey,endKey)=>+new Date(row[startKey])<=+new Date(interval.starts_at)&&(!row[endKey]||+new Date(row[endKey])>=+new Date(interval.ends_at));
export function money(raw){return raw/costScale+(raw%costScale*2n>=costScale?1n:0n);}
export function distributeRoundedCost(buckets){
 const total=money(buckets.reduce((sum,b)=>sum+b.raw,0n));
 const left=Number(total-buckets.reduce((sum,b)=>sum+b.raw/costScale,0n));
 const order=[...buckets].sort((a,b)=>a.raw%costScale===b.raw%costScale?a.key.localeCompare(b.key):a.raw%costScale>b.raw%costScale?-1:1);
 const bonuses=new Set(order.slice(0,left).map(b=>b.key));
 return new Map(buckets.map(b=>[b.key,String(b.raw/costScale+(bonuses.has(b.key)?1n:0n))]));
}

export function intervalPrice(interval,tariffs=[]){
 const matches=tariffs.filter(t=>!t.retired_at&&covers(t,interval,'valid_from','valid_until'));
 if(!tariffs.length)return {rate:defaultExpoEstimate.tariff_rp_per_kwh,basis:{kind:'expo_default',energy_rate_rp_kwh:defaultExpoEstimate.tariff_rp_per_kwh,reference:'Acuan konversi token expo; biaya energi, tanpa pajak pengisian'}};
 if(matches.length!==1)return {rate:null,issue:matches.length?'tariff_overlap':'tariff_interval_uncovered'};
 const t=matches[0];
 try{if(parseDecimal(t.energy_rate_rp_kwh,12)<=0n)throw Error();}catch{return {rate:null,issue:'unpriced_interval'};}
 return {rate:t.energy_rate_rp_kwh,basis:{kind:'tariff_schedule',id:t.id,source:t.source,energy_rate_rp_kwh:t.energy_rate_rp_kwh,reference:t.source_reference}};
}

// Live estimates only: no write to finalized bills, payments or token balance.
// Room energy is assigned only where a single occupancy covers the interval.
export function runningRoomCosts(rooms,tariffs=[],occupancies=[]){
 const bases=new Map();let total=0n,hasKnownCost=false,allKnownPriced=true;
 const result=rooms.map(room=>{
  const buckets=new Map(),issues=new Set();let raw=0n,hasUnpriced=false;
  for(const interval of room.intervals){
   const energy=parseDecimal(interval.energy_kwh,9);
   const {rate,basis,issue}=intervalPrice(interval,tariffs);if(issue)issues.add(issue);
   let intervalRaw=null;
   try{if(rate!==null){const price=parseDecimal(rate,12);if(price>0n)intervalRaw=energy*price;}}catch{/* Invalid stored pricing must remain unavailable. */}
   if(intervalRaw===null){hasUnpriced=true;issues.add('unpriced_interval');}
   else{raw+=intervalRaw;bases.set(JSON.stringify(basis),basis);}
   const active=occupancies.filter(o=>o.room_id===room.room_id&&overlaps(o,interval,'starts_at','ends_at'));
   const occupant=active.length===1&&!['simulation','mixed'].includes(active[0].source)&&covers(active[0],interval,'starts_at','ends_at')?active[0]:null;
   const kind=occupant?'tenant':active.length?'pending':'owner_unassigned';
   if(kind==='pending')issues.add('occupancy_allocation_pending');
   const key=occupant?occupant.id:kind;
   if(!buckets.has(key))buckets.set(key,{key,kind,occupancy_id:occupant?.id??null,tenant_id:occupant?.user_id??null,tenant_name:occupant?.tenant_name??null,energy:0n,raw:0n,unpriced:false});
   const bucket=buckets.get(key);bucket.energy+=energy;
   if(intervalRaw===null)bucket.unpriced=true;else bucket.raw+=intervalRaw;
  }
  const known=room.observed_consumption_kwh!==null;
  const estimated=known&&!hasUnpriced?String(money(raw)):null;
  const costs=hasUnpriced?null:distributeRoundedCost([...buckets.values()]);
  const allocations=[...buckets.values()].map(({energy,raw:partRaw,unpriced,key,...part})=>({...part,energy_kwh:formatDecimal(energy,9),estimated_cost_rp:hasUnpriced||unpriced?null:costs.get(key)}));
  if(known){hasKnownCost=true;if(estimated===null)allKnownPriced=false;else total+=BigInt(estimated);}
  return {...room,intervals:undefined,estimated_cost_rp:estimated,allocations,cost_issues:[...issues]};
 });
 return {rooms:result,cost_estimate:{status:'estimate',estimated_cost_rp:hasKnownCost&&allKnownPriced?String(total):null,
  pricing:[...bases.values()],components_included:['room'],excluded_components:['communal_rfid','shared'],
  allocation_rule:'single_occupancy_covering_each_valid_interval',rounding:'half_up_per_room_largest_remainder_allocations'}};
}
