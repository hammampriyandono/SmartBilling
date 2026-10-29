import {HttpError} from './http-input.js';

export function calendarMonth(value){
 if(typeof value!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(value))throw new HttpError(400,'invalid_month');
 return value;
}
export function purchaseDate(value){
 if(typeof value!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)throw new HttpError(400,'invalid_purchase_date');
 return value;
}
export function integerRupiah(value){
 // A decimal string on the wire; never round fractional or exponential inputs.
 if(typeof value!=='string'||!/^\d{1,13}$/.test(value))throw new HttpError(400,'invalid_amount_rp');
 const amount=BigInt(value);if(amount<=0n||amount>1000000000000n)throw new HttpError(400,'invalid_amount_rp');
 return String(amount);
}

export function tokenEnergy(value){
 if(value===null)return null;
 if(typeof value!=='string'||!/^\d{1,9}(\.\d{1,6})?$/.test(value)||!/[1-9]/.test(value))throw new HttpError(400,'invalid_energy_kwh');
 const [whole,fraction='']=value.split('.'),trimmed=fraction.replace(/0+$/,'');
 return String(BigInt(whole))+(trimmed?'.'+trimmed:'');
}

// Explicit expo assumptions, not a PLN tariff lookup. Integer arithmetic and
// half-up rounding to 0.01 kWh give the same result in preview and persistence.
export const defaultExpoEstimate=Object.freeze({tariff_rp_per_kwh:'1444.70',tax_percent:'3'});
export function estimateTokenEnergy(amount,tariff=defaultExpoEstimate.tariff_rp_per_kwh,tax=defaultExpoEstimate.tax_percent){
 const nominal=BigInt(integerRupiah(amount));
 function scaled(value,pattern,places,code){
  if(typeof value!=='string'||!pattern.test(value))throw new HttpError(400,code);
  const [whole,fraction='']=value.split('.');return BigInt(whole)*10n**BigInt(places)+BigInt(fraction.padEnd(places,'0'));
 }
 const rate=scaled(tariff,/^\d{1,6}(\.\d{1,4})?$/,4,'invalid_token_tariff');
 const taxBps=scaled(tax,/^\d{1,2}(\.\d{1,2})?$/,2,'invalid_token_tax');
 if(rate===0n)throw new HttpError(400,'invalid_token_tariff');
 const numerator=nominal*(10000n-taxBps)*100n;
 const hundredths=(numerator+rate/2n)/rate;
 if(hundredths===0n||hundredths>99999999999n)throw new HttpError(400,'token_estimate_out_of_range');
 const energy=`${hundredths/100n}.${String(hundredths%100n).padStart(2,'0')}`;
 return {energy_kwh:energy,energy_calculation:{kind:'simulation_estimate',method:'nominal_less_tax_v1',
  tariff_rp_per_kwh:String(tariff),tax_percent:String(tax),rounding:'half_up_2_decimals'}};
}

// One statement = one PostgreSQL snapshot for purchases, revisions and payment states.
export async function monthlyTokenSummary(db,property,month){
 const result=await db.query(`WITH bounds AS (
 SELECT ($2||'-01')::date local_start, (($2||'-01')::date+interval '1 month')::date local_end,
   ($2||'-01')::timestamp AT TIME ZONE $3 starts_at,
   (($2||'-01')::timestamp+interval '1 month') AT TIME ZONE $3 ends_at
 ), finals AS (
 SELECT bp.* FROM billing_periods bp CROSS JOIN bounds b
 WHERE bp.property_id=$1 AND bp.status='finalized' AND bp.source='production'
   AND bp.starts_at>=b.starts_at AND bp.ends_at<=b.ends_at
 ), crossing AS (
 SELECT bp.id,bp.starts_at,bp.ends_at,bp.revision_no FROM billing_periods bp CROSS JOIN bounds b
 WHERE bp.property_id=$1 AND bp.status='finalized' AND bp.source='production'
   AND bp.starts_at<b.ends_at AND bp.ends_at>b.starts_at
   AND NOT(bp.starts_at>=b.starts_at AND bp.ends_at<=b.ends_at)
 ), shares AS (
 SELECT bs.total_cost_rp,COALESCE(ps.status,'unpaid') payment_status
 FROM finals f JOIN room_bills rb ON rb.billing_period_id=f.id
 JOIN bill_shares bs ON bs.room_bill_id=rb.id
 LEFT JOIN bill_payment_states ps ON ps.bill_share_id=bs.id
 WHERE bs.occupancy_id IS NOT NULL AND bs.allocation_kind='occupancy' AND rb.status='finalized'
 ), tokens AS (
 SELECT COALESCE(sum(v.amount_rp),0)::text total,
 CASE WHEN count(*)>0 AND count(*) FILTER(WHERE v.energy_kwh IS NULL)=0 THEN sum(v.energy_kwh)::text END energy_total_kwh,
 count(*) FILTER(WHERE v.energy_kwh IS NULL)::int energy_missing_count,
 count(*) FILTER(WHERE v.energy_calculation IS NOT NULL)::int energy_estimated_count,
 count(*)::int purchase_count FROM token_purchases h
 JOIN token_purchase_revisions v ON v.purchase_id=h.id AND v.row_version=h.row_version CROSS JOIN bounds b
 WHERE h.property_id=$1 AND h.status='active' AND v.purchase_date>=b.local_start AND v.purchase_date<b.local_end
 ), amounts AS (
 SELECT COALESCE(sum(total_cost_rp),0)::text total,
 COALESCE(sum(total_cost_rp) FILTER(WHERE payment_status='paid'),0)::text paid,
 COALESCE(sum(total_cost_rp) FILTER(WHERE payment_status='unpaid'),0)::text unpaid,
 count(*) FILTER(WHERE total_cost_rp IS NULL)::int invalid_count FROM shares
 ) SELECT b.starts_at,b.ends_at,t.total token_total_rp,t.energy_total_kwh,t.energy_missing_count,t.purchase_count,t.energy_estimated_count,
 CASE WHEN EXISTS(SELECT 1 FROM finals) AND a.invalid_count=0 THEN a.total END tenant_total_rp,
 CASE WHEN EXISTS(SELECT 1 FROM finals) AND a.invalid_count=0 THEN a.paid END paid_total_rp,
 CASE WHEN EXISTS(SELECT 1 FROM finals) AND a.invalid_count=0 THEN a.unpaid END unpaid_total_rp,
 (SELECT count(*)::int FROM finals) final_period_count,a.invalid_count,
 COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'starts_at',starts_at,'ends_at',ends_at,'revision_no',revision_no) ORDER BY starts_at,id) FROM finals),'[]') periods,
 COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.starts_at,c.id) FROM crossing c),'[]') cross_month_periods
 FROM bounds b CROSS JOIN tokens t CROSS JOIN amounts a`,[property.id,calendarMonth(month),property.timezone]);
 const row=result.rows[0];
 return {...row,property_id:property.id,timezone:property.timezone,month,
  difference_rp:row.tenant_total_rp===null?null:String(BigInt(row.token_total_rp)-BigInt(row.tenant_total_rp)),
  availability:row.tenant_total_rp===null?'unavailable':row.cross_month_periods.length?'partial':'available',
  issues:[...(row.cross_month_periods.length?['cross_month_period_excluded']:[]),...(row.invalid_count?['invalid_final_share']:[])],
  period_rule:'wholly_contained_local_month',payment_basis:'current_status_not_cash_flow'};
}
