import {getJson,shiftDate,validRange} from './data.js';
export function sessionRange({from,to}) {
 if(!validRange(from,to)||[from,to].some(d=>new Date(`${d}T00:00:00Z`).toISOString().slice(0,10)!==d))throw new Error('Pilih rentang tanggal valid, maksimal 31 hari.');
 return {from:`${from}T00:00:00+07:00`,to:`${shiftDate(to,1)}T00:00:00+07:00`};
}
export const sessionDate=value=>value?new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'medium',timeZone:'Asia/Jakarta'}).format(new Date(value)):'Belum diperbarui';
const energy={session_open:'Menunggu tap penutup.',missing_boundary:'Pembacaan tepat pada waktu tap awal atau akhir belum tersedia.',invalid_quality:'Ada pembacaan sensor yang tidak valid.',ambiguous_timestamp:'Lebih dari satu pembacaan memiliki waktu yang sama.',gap:'Jeda pembacaan melebihi toleransi backend.',counter_reset:'Counter energi mengalami reset atau berganti epoch.',counter_decreased:'Counter energi turun pada interval sesi.',too_many_samples:'Jumlah pembacaan melebihi batas pemeriksaan backend.'};
export const energyReason=(reason,value)=>value!==null&&value!==undefined?'Delta counter terverifikasi oleh backend.':energy[reason]||'Rangkaian pembacaan belum memenuhi syarat perhitungan.';
const review={participant_or_facility_no_longer_valid:'Akses peserta, kartu, meter, atau fasilitas tidak lagi berlaku.',invalid_card_or_account:'Kartu atau akun peserta tidak lagi berlaku.',invalid_occupancy:'Masa tinggal peserta tidak sesuai dengan sesi.',meter_changed_or_unavailable:'Meter berubah atau tidak tersedia.',non_increasing_time:'Urutan waktu tap perlu diperiksa.',unavailable_facility:'Fasilitas tidak tersedia untuk digunakan.'};
export const reviewReason=reason=>review[reason]||'Sesi perlu diperiksa. Belum ditutup otomatis.';
export async function facilityPages(signal,request=getJson) {
 const rows=[],seen=new Set();let after=null;
 do{const result=await request(`/api/facilities?limit=100${after?`&after=${encodeURIComponent(after)}`:''}`,signal);rows.push(...result.data);after=result.next_after;
  if(after&&seen.has(after))throw new Error('Pagination fasilitas tidak bergerak. Coba lagi.');if(after)seen.add(after);
 }while(after&&!signal.aborted);
 return rows;
}
