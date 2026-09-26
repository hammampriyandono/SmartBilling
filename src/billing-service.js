import {randomUUID} from 'node:crypto';
import {segmentEnergy,energyCost,roundHalfUp,parseDecimal,formatDecimal} from './billing-calculation.js';
const max=(a,b)=>new Date(a)>new Date(b)?a:b,min=(a,b)=>new Date(a)<new Date(b)?a:b;
const json=v=>JSON.stringify(v);
async function issue(db,period,scope,code,details={},room=null,session=null){await db.query('INSERT INTO billing_issues(id,billing_period_id,room_bill_id,usage_session_id,scope,code,details) VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),period,room,session,scope,code,details]);}
async function evaluateMeter(db,meter,start,end,maxGap){
 const rows=(await db.query(`SELECT id,measured_at,energy_kwh,counter_epoch,quality,data_source FROM meter_readings WHERE meter_id=$1 AND measured_at>=$2 AND measured_at<=$3 ORDER BY measured_at,id`,[meter.id,start,end])).rows;
 const base={boundaries:rows.length&&+new Date(rows[0].measured_at)===+new Date(start)&&+new Date(rows.at(-1).measured_at)===+new Date(end)?'valid':!rows.length||+new Date(rows[0]?.measured_at)!==+new Date(start)?'missing_start':'missing_end',start_kwh:rows[0]?.energy_kwh??null,end_kwh:rows.at(-1)?.energy_kwh??null};
 let result=segmentEnergy(base),reason=result.reason;
 if(result.status==='valid'){
  const seen=new Set();for(let i=0;i<rows.length;i++){const row=rows[i],key=+new Date(row.measured_at);if(seen.has(key)){reason='ambiguous_timestamp';break;}seen.add(key);
   if(row.quality!=='valid'){reason='invalid_quality';break;}if(i){const prior=rows[i-1],seconds=(key-new Date(prior.measured_at))/1000;if(row.counter_epoch!==prior.counter_epoch){reason='counter_reset';break;}if(parseDecimal(row.energy_kwh,9)<parseDecimal(prior.energy_kwh,9)){reason='counter_decreased';break;}if(maxGap==null){reason='gap_policy_unset';break;}if(seconds>maxGap){reason='gap';break;}}
  }
 }
 if(reason)result={status:'review',energy_kwh:null,reason};
 return{...result,start_reading_id:rows[0]?.id??null,end_reading_id:rows.at(-1)?.id??null,start_energy_kwh:rows[0]?.energy_kwh??null,end_energy_kwh:rows.at(-1)?.energy_kwh??null,data_source:rows.some(r=>r.data_source==='simulation')||meter.source==='simulation'?'simulation':'production',sample_count:rows.length};
}
export async function calculatePeriod(db,periodId){
 const period=(await db.query('SELECT * FROM billing_periods WHERE id=$1 FOR UPDATE',[periodId])).rows[0];if(!period)throw new Error('billing_period_not_found');if(!['draft','review'].includes(period.status))throw new Error('billing_period_locked');
 await db.query('DELETE FROM billing_issues WHERE billing_period_id=$1',[period.id]);
 await db.query('DELETE FROM bill_session_allocations WHERE bill_share_id IN (SELECT bs.id FROM bill_shares bs JOIN room_bills rb ON rb.id=bs.room_bill_id WHERE rb.billing_period_id=$1)',[period.id]);
 await db.query('DELETE FROM bill_shares WHERE room_bill_id IN (SELECT id FROM room_bills WHERE billing_period_id=$1)',[period.id]);
 await db.query('DELETE FROM room_bills WHERE billing_period_id=$1',[period.id]);
 await db.query('DELETE FROM billing_meter_segments WHERE billing_period_id=$1',[period.id]);
 const tariffs=(await db.query(`SELECT * FROM tariff_schedules WHERE property_id=$1 AND valid_from<=$2 AND (valid_until IS NULL OR valid_until>=$3) AND retired_at IS NULL`,[period.property_id,period.starts_at,period.ends_at])).rows;
 const tariff=tariffs.length===1?tariffs[0]:null;if(!tariff)await issue(db,period.id,'property',tariffs.length?'tariff_overlap':'tariff_missing');
 const policy=period.policy_snapshot||{},gap=policy.production_max_gap_seconds??null;
 const rooms=(await db.query(`SELECT * FROM rooms WHERE property_id=$1 AND active_from<$3 AND (active_until IS NULL OR active_until>$2) ORDER BY id`,[period.property_id,period.starts_at,period.ends_at])).rows;
 let periodSource=tariff?.source==='simulation'?'simulation':'production',total=0n,allRooms=true;
 for(const room of rooms){
  const roomBillId=randomUUID(),reasons=[],meters=(await db.query(`SELECT * FROM meters WHERE property_id=$1 AND room_id=$2 AND kind='room' AND installed_at<$4 AND (retired_at IS NULL OR retired_at>$3) ORDER BY installed_at,id`,[period.property_id,room.id,period.starts_at,period.ends_at])).rows;
  let energy=0n,valid=Boolean(tariff)&&meters.length>0,source='production';
  if(!meters.length)reasons.push('no_data');
  for(const meter of meters){const start=max(period.starts_at,meter.installed_at),end=min(period.ends_at,meter.retired_at||period.ends_at),e=await evaluateMeter(db,meter,start,end,gap);if(e.data_source==='simulation')source='simulation';
   await db.query(`INSERT INTO billing_meter_segments(id,billing_period_id,meter_id,room_id,segment_starts_at,segment_ends_at,start_reading_id,end_reading_id,start_energy_kwh,end_energy_kwh,consumption_kwh,quality,reason,data_source,calculation_evidence) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,[randomUUID(),period.id,meter.id,room.id,start,end,e.start_reading_id,e.end_reading_id,e.start_energy_kwh,e.end_energy_kwh,e.energy_kwh,e.status,e.reason,e.data_source,json({sample_count:e.sample_count,max_gap_seconds:gap})]);
   if(e.status==='valid')energy+=parseDecimal(e.energy_kwh,9);else{valid=false;reasons.push(e.reason);}
  }
  const occupancies=(await db.query(`SELECT * FROM occupancies WHERE room_id=$1 AND starts_at<=$2 AND (ends_at IS NULL OR ends_at>=$3) ORDER BY id`,[room.id,period.starts_at,period.ends_at])).rows;
  if(occupancies.length>1){valid=false;reasons.push('occupancy_boundary_missing');}
  const sessions=(await db.query(`SELECT s.*,sp.id participant_id,sp.occupancy_id FROM usage_sessions s JOIN session_participants sp ON sp.usage_session_id=s.id JOIN occupancies o ON o.id=sp.occupancy_id WHERE o.room_id=$1 AND s.started_at<$3 AND (s.ended_at IS NULL OR s.ended_at>$2) ORDER BY s.started_at,s.id`,[room.id,period.starts_at,period.ends_at])).rows;
  let attr=0n;for(const session of sessions){let why=null;if(!session.ended_at||session.energy_status!=='valid')why='session_energy_unavailable';else if(+new Date(session.started_at)<+new Date(period.starts_at)||+new Date(session.ended_at)>+new Date(period.ends_at))why='session_crosses_period';else{const oc=(await db.query('SELECT * FROM occupancies WHERE id=$1',[session.occupancy_id])).rows[0];if(+new Date(session.started_at)<+new Date(oc.starts_at)||(oc.ends_at&&+new Date(session.ended_at)>+new Date(oc.ends_at)))why='session_crosses_occupancy';}
   if(session.data_source==='simulation')source='simulation';if(why){valid=false;reasons.push(why);await issue(db,period.id,'session',why,{},null,session.id);}else attr+=parseDecimal(session.energy_kwh,9);
  }
  if(source==='simulation'){periodSource=periodSource==='production'?'mixed':periodSource;valid=false;reasons.push('simulation_not_finalizable');}
  const roomEnergy=formatDecimal(energy,9),attrEnergy=formatDecimal(attr,9),roomCost=tariff?roundHalfUp(energyCost(roomEnergy,tariff.energy_rate_rp_kwh)):null,attrCost=tariff?roundHalfUp(energyCost(attrEnergy,tariff.energy_rate_rp_kwh)):null,preview=roomCost==null?null:roomCost+attrCost;
  await db.query(`INSERT INTO room_bills(id,billing_period_id,room_id,status,room_energy_kwh,attributable_energy_kwh,room_cost_rp,attributable_cost_rp,preview_total_cost_rp,total_cost_rp,reasons,calculation_evidence) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,[roomBillId,period.id,room.id,valid?'finalized':'review',valid?roomEnergy:null,valid?attrEnergy:null,valid?String(roomCost):null,valid?String(attrCost):null,preview==null?null:String(preview),valid?String(preview):null,json([...new Set(reasons)]),json({meter_count:meters.length,session_count:sessions.length,source})]);
  const occupancy=occupancies[0]||null;if(valid){const shareId=randomUUID();await db.query(`INSERT INTO bill_shares(id,room_bill_id,occupancy_id,allocation_kind,room_energy_kwh,attributable_energy_kwh,room_cost_rp,attributable_cost_rp,rounding_adjustment_rp,total_cost_rp,allocation_evidence) VALUES($1,$2,$3,$4,$5,$6,$7,$8,0,$9,$10)`,[shareId,roomBillId,occupancy?.id||null,occupancy?'occupancy':'owner_unassigned',roomEnergy,attrEnergy,String(roomCost),String(attrCost),String(preview),json({policy:occupancy?'single_full_period_occupancy':'owner_unassigned'})]);for(const session of sessions.filter(s=>s.energy_status==='valid'&&+new Date(s.started_at)>=+new Date(period.starts_at)&&+new Date(s.ended_at)<=+new Date(period.ends_at)))await db.query(`INSERT INTO bill_session_allocations(id,bill_share_id,usage_session_id,session_participant_id,allocated_energy_kwh,cost_rp,status,calculation_evidence) VALUES($1,$2,$3,$4,$5,$6,'valid',$7)`,[randomUUID(),shareId,session.id,session.participant_id,session.energy_kwh,String(roundHalfUp(energyCost(session.energy_kwh,tariff.energy_rate_rp_kwh))),json({method:'single_participant'})]);total+=preview;}else{allRooms=false;for(const code of new Set(reasons))await issue(db,period.id,'room',code,{},roomBillId);}
 }
 let facilityValid=true;
 const facilityMeters=(await db.query(`SELECT m.* FROM meters m JOIN communal_loads c ON c.id=m.communal_load_id WHERE m.property_id=$1 AND m.kind='communal' AND c.load_type='attributable' AND m.installed_at<$3 AND (m.retired_at IS NULL OR m.retired_at>$2) ORDER BY m.id`,[period.property_id,period.starts_at,period.ends_at])).rows;
 for(const meter of facilityMeters){
  const start=max(period.starts_at,meter.installed_at),end=min(period.ends_at,meter.retired_at||period.ends_at),e=await evaluateMeter(db,meter,start,end,gap);
  const sessions=(await db.query(`SELECT id,energy_kwh,energy_status,started_at,ended_at,data_source FROM usage_sessions WHERE meter_id=$1 AND started_at<$3 AND (ended_at IS NULL OR ended_at>$2) ORDER BY started_at,id`,[meter.id,period.starts_at,period.ends_at])).rows;
  if(e.data_source==='simulation'||sessions.some(s=>s.data_source==='simulation'))periodSource=periodSource==='production'?'mixed':periodSource;
  if(e.status!=='valid'){facilityValid=false;await issue(db,period.id,'property',e.reason,{meter_id:meter.id,facility_id:meter.communal_load_id});continue;}
  let allocated=0n,comparable=true;
  for(const session of sessions){if(session.energy_status!=='valid'||!session.ended_at||+new Date(session.started_at)<+new Date(start)||+new Date(session.ended_at)>+new Date(end)){comparable=false;continue;}allocated+=parseDecimal(session.energy_kwh,9);}
  const measured=parseDecimal(e.energy_kwh,9),outside=measured-allocated;
  if(!comparable||outside!==0n){facilityValid=false;await issue(db,period.id,'property',outside<0n?'negative_property_residual':'facility_energy_outside_session',{meter_id:meter.id,facility_id:meter.communal_load_id,measured_energy_kwh:e.energy_kwh,session_energy_kwh:formatDecimal(allocated,9),outside_session_energy_kwh:formatDecimal(outside,9)});}
 }
 const mainMeters=(await db.query(`SELECT * FROM meters WHERE property_id=$1 AND kind='main' AND installed_at<$3 AND (retired_at IS NULL OR retired_at>$2)`,[period.property_id,period.starts_at,period.ends_at])).rows;let mainValid=mainMeters.length>0,main=0n;
 for(const meter of mainMeters){const e=await evaluateMeter(db,meter,max(period.starts_at,meter.installed_at),min(period.ends_at,meter.retired_at||period.ends_at),gap);if(e.status==='valid')main+=parseDecimal(e.energy_kwh,9);else{mainValid=false;await issue(db,period.id,'property',e.reason);}}
 if(!mainMeters.length){mainValid=false;await issue(db,period.id,'property','no_data');}
 const status=allRooms?'draft':'review';await db.query(`UPDATE billing_periods SET status=$2,property_reconciliation_status=$3,source=$4,tariff_snapshot=$5,main_energy_kwh=$6,preview_total_cost_rp=$7,total_cost_rp=NULL,row_version=row_version+1,updated_at=now() WHERE id=$1`,[period.id,status,mainValid&&facilityValid?'valid':'review',periodSource,tariff?json({id:tariff.id,energy_rate_rp_kwh:tariff.energy_rate_rp_kwh,currency:'IDR',source_reference:tariff.source_reference,source:tariff.source}):null,mainValid?formatDecimal(main,9):null,String(total)]);
 return(await db.query('SELECT * FROM billing_periods WHERE id=$1',[period.id])).rows[0];
}
