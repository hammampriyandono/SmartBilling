import {billingGet} from './billing-data.js';
import {viewPath} from '../src/display-policy.js';

export async function loadTenantRunning(userId,selectedId,showTestData,signal,request=fetch){
 const periods=[],seen=new Set();let after=null;
 do{
  const page=await billingGet(viewPath(`/api/billing-estimates?limit=100${after?'&after='+encodeURIComponent(after):''}`,showTestData),signal,userId,request);
  if(!Array.isArray(page.data))throw new Error('Daftar estimasi belum dapat dibaca.');
  periods.push(...page.data);after=page.next_after;
  if(after&&seen.has(after))throw new Error('Daftar estimasi belum dimuat lengkap.');if(after)seen.add(after);
 }while(after&&!signal.aborted);
 signal.throwIfAborted();
 periods.sort((a,b)=>Date.parse(b.starts_at)-Date.parse(a.starts_at)||b.revision_no-a.revision_no||a.id.localeCompare(b.id));
 const chosen=periods.find(row=>row.id===selectedId)||periods[0];
 if(!chosen)return {periods,data:null};
 try{return {periods,data:(await billingGet(viewPath(`/api/billing-estimates/${chosen.id}`,showTestData),signal,userId,request)).data};}
 catch(error){if(error.status===404)return {periods:[],data:null,refreshFinals:true};throw error;}
}

export function tenantEstimateReason(row){
 if(row.reason==='too_many_samples')return 'Periode terlalu besar untuk estimasi. Hubungi pemilik.';
 if(row.reason==='allocation_pending')return 'Bagian Anda masih perlu ditinjau pemilik.';
 if(row.reason==='pricing_unavailable')return 'Acuan biaya belum lengkap; energi Anda tetap dicatat.';
 if(row.reason==='insufficient_readings')return 'Belum cukup pembacaan pada masa tinggal Anda.';
 return 'Estimasi dari interval valid; periode dapat masih parsial.';
}
