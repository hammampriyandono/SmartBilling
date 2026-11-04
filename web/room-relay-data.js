import {newAction,sendAction} from './admin-mutations.js';

export const relayBlocked={relay_control_disabled:'Kontrol relay belum diaktifkan untuk properti ini.',
  relay_test_expired:'Waktu akses uji relay sudah berakhir. Hubungi operator untuk melanjutkan pengujian.',
  relay_not_commissioned:'Relay kamar belum dipetakan dan diverifikasi.',relay_installation_unavailable:'Pemasangan perangkat tidak tersedia untuk kontrol.',
  relay_installation_ambiguous:'Perangkat terpasang pada lebih dari satu titik ukur. Periksa pemasangan sebelum menggunakan kontrol.',
  relay_status_stale:'Status relay belum tersedia atau sudah lama. Menunggu laporan baru dari perangkat.',relay_command_pending:'Menunggu konfirmasi perintah sebelumnya.'};
export const relayCommandLabel={queued:'Menunggu pengiriman',sent:'Dikirim · belum dikonfirmasi',confirmed:'Dikonfirmasi perangkat',
  rejected:'Ditolak perangkat',unconfirmed:'Belum terkonfirmasi · batas waktu lewat'};
export function relayStateLabel(data){
  const onLevel=data?.gpio_on_level===undefined?1:data.gpio_on_level;
  if(!data?.fresh||data.gpio_pin!==3||![0,1].includes(data.gpio_level)||![0,1].includes(onLevel))return 'Status relay belum diketahui';
  const state=data.gpio_level===onLevel?'on':'off';
  if(data.reported_state!==state)return 'Status relay belum diketahui';
  return `GPIO3 ${data.gpio_level===1?'HIGH':'LOW'} · ${state.toUpperCase()}`;
}
export function relayAction(data,state,reason,accountId){
  if(!data?.can_control||!['on','off'].includes(state)||!reason.trim())throw new Error('Periksa kesiapan perangkat dan isi alasan tindakan.');
  return newAction(`/api/owner/rooms/${encodeURIComponent(data.room_id)}/relay/commands`,'POST',
    {meter_id:data.meter_id,row_version:data.row_version,desired_state:state,reason:reason.trim()},accountId);
}
export async function sendRelayAction(action,signal,request=fetch){
  try{return await sendAction(action,signal,request);}catch(error){
    if(relayBlocked[error.code])error.message=relayBlocked[error.code];
    throw error;
  }
}
export async function loadRoomRelay(roomId,accountId,signal,request=fetch){
  const response=await request(`/api/owner/rooms/${encodeURIComponent(roomId)}/relay`,{cache:'no-store',credentials:'same-origin',
    signal:AbortSignal.any([signal,AbortSignal.timeout(15000)]),headers:{'X-Account-ID':accountId}});
  if(response.status===401&&typeof window!=='undefined')window.dispatchEvent(new Event('session-expired'));
  if(!response.ok)throw new Error('Status kontrol belum dapat dimuat. Silakan coba lagi.');
  return (await response.json()).data;
}
