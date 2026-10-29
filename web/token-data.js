import {billingGet} from './billing-data.js';
import {newAction} from './admin-mutations.js';
export function tokenRupiah(value){
 if(value===null||value===undefined)return 'Belum tersedia';
 if(!/^-?\d+$/.test(String(value)))return 'Perlu ditinjau';
 return new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(BigInt(value));
}
export function tokenKwh(value){
 if(value===null||value===undefined)return 'Belum dicatat';
 if(!/^\d+(\.\d{1,6})?$/.test(String(value)))return 'Perlu ditinjau';
 const [whole,fraction='']=String(value).split('.'),trimmed=fraction.replace(/0+$/,'');
 return `${new Intl.NumberFormat('id-ID').format(BigInt(whole))}${trimmed?','+trimmed:''} kWh`;
}
export function tokenEstimateInput(values){
 // New entries use backend defaults; corrections keep their saved assumptions.
 if(values.tariff_rp_per_kwh===undefined&&values.tax_percent===undefined)return {};
 const tariff=String(values.tariff_rp_per_kwh??'').trim().replace(',','.'),tax=String(values.tax_percent??'').trim().replace(',','.');
 if(!/^\d{1,6}(\.\d{1,4})?$/.test(tariff)||!/[1-9]/.test(tariff))throw new Error('Isi tarif simulasi positif, maksimal 6 angka sebelum dan 4 angka sesudah desimal.');
 if(!/^\d{1,2}(\.\d{1,2})?$/.test(tax))throw new Error('Isi pajak simulasi antara 0 dan 99,99 persen.');
 return {tariff_rp_per_kwh:tariff,tax_percent:tax};
}
export async function loadTokenEstimate(values,signal,accountId,request=fetch){
 const query=new URLSearchParams({amount_rp:values.amount_rp,...tokenEstimateInput(values)});
 return (await billingGet(`/api/owner/token-energy-estimate?${query}`,signal,accountId,request)).data;
}
export function tokenAction(action,row,values,propertyId,accountId){
 const base='/api/owner/token-purchases',reason=values.reason?.trim();
 if(action!=='create'&&!reason)throw new Error('Alasan koreksi atau pembatalan wajib diisi.');
 const body=action==='cancel'?{row_version:row.row_version,reason}:{purchase_date:values.purchase_date,amount_rp:values.amount_rp,note:values.note?.trim()||null,...(action==='create'?{property_id:propertyId}:{row_version:row.row_version,reason})};
 if(action!=='cancel'&&(!/^\d{1,13}$/.test(body.amount_rp)||BigInt(body.amount_rp)<1n||BigInt(body.amount_rp)>1000000000000n))throw new Error('Masukkan Rupiah bulat positif, maksimal Rp1.000.000.000.000.');
 if(action!=='cancel'&&values.energy_mode==='estimate')body.energy_estimate=tokenEstimateInput(values);
 else if(action!=='cancel'&&values.energy_kwh!==undefined){
  const energy=values.energy_kwh===null?null:values.energy_kwh.trim().replace(',','.');
  if(energy!==null&&energy!==''&&(!/^\d{1,9}(\.\d{1,6})?$/.test(energy)||!/[1-9]/.test(energy)))throw new Error('Masukkan kWh positif, maksimal 9 angka sebelum dan 6 angka sesudah desimal.');
  body.energy_kwh=energy||null;
 }
 return newAction(action==='create'?base:`${base}/${row.id}${action==='cancel'?'/cancel':''}`,action==='correct'?'PATCH':'POST',body,accountId);
}
export async function loadTokenMonth(propertyId,month,signal,accountId,request=fetch){
 const query=new URLSearchParams({property_id:propertyId,month}),get=path=>billingGet(path,signal,accountId,request);
 const summaryPromise=get(`/api/owner/monthly-token-summary?${query}`);
 // Await both branches together so a failed summary never becomes an unhandled rejection.
 const rowsPromise=(async()=>{const rows=[],seen=new Set();let after=null;do{
  const page=await get(`/api/owner/token-purchases?${query}&limit=100${after?'&after='+encodeURIComponent(after):''}`);
  if(!Array.isArray(page.data))throw new Error('Daftar pembelian token belum dapat dibaca.');rows.push(...page.data);after=page.next_after;
  if(after&&seen.has(after))throw new Error('Daftar pembelian belum dimuat lengkap.');if(after)seen.add(after);
 }while(after&&!signal.aborted);signal.throwIfAborted();return rows.sort((a,b)=>b.purchase_date.localeCompare(a.purchase_date)||a.id.localeCompare(b.id));})();
 const [summary,rows]=await Promise.all([summaryPromise,rowsPromise]);return{summary:summary.data,rows};
}
