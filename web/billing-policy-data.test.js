import test from 'node:test';
import assert from 'node:assert/strict';
import {policyFormValues,policyFormBody} from './billing-policy-data.js';
import {canFinalizePeriod,periodLabel,roomBillStatus,periodTime} from './billing-data.js';

test('form aturan mempertahankan legacy dan mengirim tarif uji hanya saat dipilih',()=>{
  assert.equal(policyFormValues().boundary_method,'inside');
  const old=policyFormValues({policy_snapshot:{production_max_gap_seconds:null}});
  assert.equal(old.boundary_method,'exact');assert.equal(old.boundary_tolerance_seconds,0);
  const values={...policyFormValues(),rate:'1444.70',reference:'Asumsi uji'};
  assert.equal(policyFormBody(values).preview_tariff,null);
  assert.equal(policyFormBody({...values,use_preview:true}).preview_tariff.energy_rate_rp_kwh,'1444.70');
  assert.throws(()=>policyFormBody({...values,boundary_tolerance_seconds:'999'}),/invalid_calculation_policy/);
});
test('pratinjau tarif asumsi dibedakan dari simulasi sensor dan tidak dapat difinalisasi',()=>{
  const period={source:'production',status:'draft',room_bills:[{status:'finalized'}],policy_snapshot:{preview_tariff:{energy_rate_rp_kwh:'1444.70'}}};
  assert.equal(periodLabel(period),'Pratinjau uji · tarif asumsi');
  assert.equal(periodLabel({...period,source:'mixed'}),'Pratinjau simulasi · tarif asumsi');
  assert.equal(roomBillStatus(period,period.room_bills[0]).label,'Pratinjau uji');
  assert.equal(canFinalizePeriod(period),false);
  assert.equal(canFinalizePeriod({...period,policy_snapshot:{}}),true);
  assert.equal(canFinalizePeriod({...period,policy_snapshot:{},room_bills:[]}),false);
  assert.equal(canFinalizePeriod({...period,policy_snapshot:{},room_bills:[{status:'review'}]}),false);
  assert.match(periodTime('2026-10-28T08:00:00Z'),/15[.:]00[.:]00.*WIB/);
});
