import React from 'react';
import {kwh,estimateRupiah,reasonLabel,periodTime} from './billing-data.js';

export function SharedBilling({shared,rooms=[]}){
 if(!shared)return null;
 const labels={complete:'Rentang lengkap',partial:'Subtotal parsial',review:'Perlu ditinjau',unavailable:'Belum tersedia'};
 return <section className="billing-evidence shared-billing" aria-label="Komunal bersama">
  <h3>Komunal bersama · dibagi rata</h3>
  <p>Selisih konsumsi utama dikurangi seluruh kamar dan fasilitas RFID bermeter pada putaran yang selaras. Setiap rentang dibagi kepada penghuni aktif saat itu. Ini estimasi energi bersama, termasuk kemungkinan beban lain dan selisih pengukuran.</p>
  <div className="billing-summary"><div><span>Energi bersama</span><strong>{shared.energy_kwh==null?'Belum tersedia':kwh(shared.energy_kwh)}</strong></div><div><span>Biaya energi bersama</span><strong>{estimateRupiah(shared.estimated_cost_rp)}</strong></div><div><span>Cakupan pengukuran bersama</span><strong>{shared.coverage_seconds??0} detik</strong></div><div><span>Status</span><strong>{labels[shared.status]||'Belum tersedia'}</strong></div></div>
  {shared.reasons?.length>0&&<p className="billing-review">{shared.reasons.map(reasonLabel).join(' · ')}</p>}
  {shared.allocations?.length>0&&<div className="billing-table-wrap"><table className="billing-table"><thead><tr><th>Penghuni</th><th>Kamar</th><th>Bagian energi bersama</th><th>Biaya bagian bersama</th></tr></thead><tbody>{shared.allocations.map(a=><tr key={a.occupancy_id}><td>{a.tenant_name||'Penghuni'}</td><td>{rooms.find(r=>r.room_id===a.room_id||r.id===a.room_id)?.room_name||rooms.find(r=>r.id===a.room_id)?.name||'Kamar penghuni'}</td><td>{kwh(a.energy_kwh)}</td><td>{estimateRupiah(a.estimated_cost_rp)}</td></tr>)}</tbody></table></div>}
  {shared.runs?.length>0&&<details><summary>Bukti rentang pembagian</summary>{shared.runs.map((r,i)=><p key={i}>{periodTime(r.starts_at)} — {periodTime(r.ends_at)} · {r.recipient_count} penghuni aktif · {r.interval_count} interval · energi bersama {r.shared_energy_kwh==null?'perlu ditinjau':kwh(r.shared_energy_kwh)}</p>)}</details>}
  <p>Data kosong tidak dianggap nol. Hasil negatif tidak ditagihkan. Untuk tagihan final, batas periode, seluruh meter, tarif dan alokasi penghuni harus lengkap.</p>
 </section>;
}
