import {observedSharedUsage} from './billing-shared.js';
import {parseDecimal,formatDecimal} from './billing-calculation.js';
import {distributeRoundedCost} from './billing-running-cost.js';

// Called inside the existing period calculation transaction. Frozen bills are
// never updated here; calculatePeriod already locks and checks draft/review.
export async function addSharedToFinalCalculation(db,period,tariff,reconciliationValid){
 const occupants=(await db.query(`SELECT o.*,u.name tenant_name FROM occupancies o JOIN rooms rm ON rm.id=o.room_id JOIN users u ON u.id=o.user_id WHERE rm.property_id=$1 AND o.starts_at<$3 AND (o.ends_at IS NULL OR o.ends_at>$2)`,[period.property_id,period.starts_at,period.ends_at])).rows;
 const prices=tariff?[{...tariff,valid_from:period.starts_at,valid_until:period.ends_at}]:[{energy_rate_rp_kwh:'0',valid_from:period.starts_at,valid_until:period.ends_at}];
 const summary=await observedSharedUsage(db,period,prices,occupants);
 const rooms=(await db.query('SELECT * FROM room_bills WHERE billing_period_id=$1 ORDER BY room_id',[period.id])).rows;
 const shares=(await db.query('SELECT bs.* FROM bill_shares bs JOIN room_bills rb ON rb.id=bs.room_bill_id WHERE rb.billing_period_id=$1 ORDER BY bs.occupancy_id NULLS LAST,bs.room_bill_id',[period.id])).rows;
 const reasons=new Set();
 if(!summary.complete)reasons.add('shared_period_incomplete');
 if(!tariff||!reconciliationValid||rooms.some(r=>r.status!=='finalized'))reasons.add('shared_reconciliation_review');
 if(rooms.some(r=>summary.room_energy.find(e=>e.room_id===r.room_id)?.energy_kwh!==r.room_energy_kwh))reasons.add('shared_room_coverage_mismatch');
 if(summary.allocations.some(a=>!shares.some(s=>s.occupancy_id===a.occupancy_id))||shares.some(s=>s.occupancy_id&&!summary.allocations.some(a=>a.occupancy_id===s.occupancy_id)))reasons.add('shared_occupancy_boundary');
 if(reasons.size){
  summary.complete=false;summary.status='review';summary.reasons=[...new Set([...summary.reasons,...reasons])];
  await db.query(`UPDATE room_bills SET status='review',shared_energy_kwh=NULL,shared_cost_rp=NULL,total_cost_rp=NULL,reasons=reasons||$2::jsonb WHERE billing_period_id=$1`,[period.id,JSON.stringify([...reasons])]);
  await db.query('UPDATE bill_shares SET total_cost_rp=NULL WHERE room_bill_id IN (SELECT id FROM room_bills WHERE billing_period_id=$1)',[period.id]);
  return {summary,total:null,valid:false};
 }
 const rate=parseDecimal(tariff.energy_rate_rp_kwh,12);
 const parts=shares.map(s=>{const shared=summary.allocations.find(a=>a.occupancy_id===s.occupancy_id);return {s,shared,key:s.occupancy_id||`owner:${rooms.find(r=>r.id===s.room_bill_id).room_id}`,raw:(parseDecimal(s.room_energy_kwh,9)+parseDecimal(s.attributable_energy_kwh,9)+parseDecimal(shared?.energy_kwh||'0',9))*rate};});
 const rounded=distributeRoundedCost(parts);let total=0n;
 for(const {s,shared,key} of parts){
  const sharedCost=BigInt(shared?.estimated_cost_rp||'0'),value=BigInt(rounded.get(key));total+=value;
  const adjustment=value-BigInt(s.room_cost_rp)-BigInt(s.attributable_cost_rp)-sharedCost;
  await db.query(`UPDATE bill_shares SET shared_energy_kwh=$2,shared_cost_rp=$3,rounding_adjustment_rp=$4,total_cost_rp=$5,allocation_evidence=allocation_evidence||$6::jsonb WHERE id=$1`,[s.id,shared?.energy_kwh||'0.000000000',String(sharedCost),String(adjustment),String(value),JSON.stringify({shared_rule:summary.rule})]);
 }
 for(const room of rooms){
  const totals=(await db.query('SELECT sum(shared_energy_kwh)::text energy,sum(shared_cost_rp)::text cost,sum(total_cost_rp)::text total FROM bill_shares WHERE room_bill_id=$1',[room.id])).rows[0];
  await db.query('UPDATE room_bills SET shared_energy_kwh=$2,shared_cost_rp=$3,total_cost_rp=$4,preview_total_cost_rp=$4 WHERE id=$1',[room.id,totals.energy,totals.cost,totals.total]);
 }
 // Energy is conserved independently from Rupiah rounding.
 summary.allocated_energy_kwh=formatDecimal(summary.allocations.reduce((s,a)=>s+parseDecimal(a.energy_kwh,9),0n),9);
 return {summary,total,valid:true};
}
