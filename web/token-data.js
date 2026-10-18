import {billingGet} from './billing-data.js';
import {newAction} from './admin-mutations.js';
export function tokenRupiah(value){
 if(value===null||value===undefined)return 'Belum tersedia';
 if(!/^-?\d+$/.test(String(value)))return 'Perlu ditinjau';
 return new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(BigInt(value));
}
export function tokenAction(action,row,values,propertyId,accountId){
 const base='/api/owner/token-purchases',reason=values.reason?.trim();
 if(action!=='create'&&!reason)throw new Error('Alasan koreksi atau pembatalan wajib diisi.');
 const body=action==='cancel'?{row_version:row.row_version,reason}:{purchase_date:values.purchase_date,amount_rp:values.amount_rp,note:values.note?.trim()||null,...(action==='create'?{property_id:propertyId}:{row_version:row.row_version,reason})};
 if(action!=='cancel'&&(!/^\d{1,13}$/.test(body.amount_rp)||BigInt(body.amount_rp)<1n||BigInt(body.amount_rp)>1000000000000n))throw new Error('Masukkan Rupiah bulat positif, maksimal Rp1.000.000.000.000.');
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
