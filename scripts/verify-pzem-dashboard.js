import {readFile} from 'node:fs/promises';
import {authenticatedFetch} from './auth-client.js';
const watching=process.argv.slice(2).join(' ')==='--watch';
if(process.argv.length>2&&!watching)throw new Error('Pemakaian: node scripts/verify-pzem-dashboard.js [--watch]');
const registration=JSON.parse(await readFile(process.env.PZEM_VERIFY_REGISTRATION_FILE||'.local/expo-pzem/registration.json','utf8'));
process.env.AUTH_TEST_PASSWORD_FILE='.local/secrets/owner_login_password';process.env.AUTH_TEST_EMAIL='owner@simulation.local';process.env.AUTH_ORIGIN='http://127.0.0.1:3001';
const request=await authenticatedFetch(process.env.AUTH_ORIGIN),until=Date.now()+(watching?60000:0);let lastId=null,received=false;
try{
 const readyResponse=await request(`/api/owner/hardware-readiness?device_uid=${registration.device_uid}`);
 if(!readyResponse.ok||(await readyResponse.json()).data?.ready!==true)throw new Error('mapping_not_ready');
 console.info(watching?'Memantau pembacaan tersimpan selama 60 detik. Tidak membuat data sensor.':'Memeriksa pembacaan tersimpan; tidak membuat data sensor.');
 do{
  const response=await request(`/api/meters/${registration.installation.id}/latest`);if(!response.ok)throw new Error('latest_unavailable');
  const {data}=await response.json();
  if(data){
   if(data.data_source!=='production'||data.meter_id!==registration.installation.id)throw new Error('unexpected_reading_source');
   received=true;
   if(lastId!==data.id){lastId=data.id;console.info(JSON.stringify({status:'stored_reading',measured_at:data.measured_at,received_at:data.received_at,voltage_v:data.voltage_v,current_a:data.current_a,power_w:data.power_w,energy_kwh:data.energy_kwh}));}
  }else if(!lastId){lastId='waiting';console.info('Mapping siap; belum ada pembacaan ESP32 yang tersimpan.');}
  if(Date.now()>=until)break;await new Promise(resolve=>setTimeout(resolve,5000));
 }while(Date.now()<=until);
 if(!received)process.exitCode=2;
}catch{console.error('Verifikasi belum lulus. Periksa firmware, mapping, koneksi MQTT dan log penolakan backend.');process.exitCode=1;}
finally{
 const response=await request('/api/auth/csrf');if(response.ok){const {csrf}=await response.json();await request('/api/auth/logout',{method:'POST',headers:{'x-csrf-token':csrf}});}
}
