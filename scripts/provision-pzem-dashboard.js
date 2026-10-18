import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {authenticatedFetch} from './auth-client.js';
const directory='.local/expo-pzem',base='http://127.0.0.1:3001',uid='esp32-pzem-10003bd0ccf0';
const selected=JSON.parse(await readFile('.local/expo-local/selection.json','utf8'));
process.env.AUTH_TEST_PASSWORD_FILE='.local/secrets/owner_login_password';process.env.AUTH_TEST_EMAIL='owner@simulation.local';process.env.AUTH_ORIGIN=base;
const request=await authenticatedFetch(base);
const state=await readFile(`${directory}/registration.json`,'utf8').then(JSON.parse).catch(error=>{if(error.code==='ENOENT')return{device_uid:uid,steps:{}};throw error;});
if(state.device_uid!==uid)throw new Error('registration_identity_mismatch');
const save=()=>writeFile(`${directory}/registration.json`,JSON.stringify(state,null,2),{mode:0o600});
async function get(path){const response=await request(path);if(!response.ok)throw new Error('registration_read_failed');return response.json();}
async function post(name,path,body){
 state.steps[name]??={path,body,key:randomUUID()};const action=state.steps[name];
 if(action.path!==path)throw new Error('registration_request_conflict');await save();
 const {csrf}=await get('/api/auth/csrf');
 const response=await request(path,{method:'POST',headers:{'content-type':'application/json','x-csrf-token':csrf,'idempotency-key':action.key},body:JSON.stringify(action.body)});
 const value=await response.json();if(!response.ok)throw new Error(`registration_failed_${value.error||response.status}`);
 state[name]=value.data;await save();return value.data;
}
try{
 const rooms=(await get('/api/owner/rooms?limit=100')).data;
 if(!rooms.some(room=>room.id===selected.room_ids[0]&&room.property_id===selected.property_id&&room.source==='manual'))throw new Error('selected_room_mismatch');
 const existing=(await get('/api/owner/devices?limit=100')).data.find(device=>device.device_uid===uid);
 const device=state.device||existing||await post('device','/api/owner/devices',{property_id:selected.property_id,device_uid:uid,display_name:'ESP32-C3 PZEM — Kamar 1',reason:'Integrasi PZEM nyata ke dashboard lokal Kamar 1'});
 if(device.property_id!==selected.property_id||device.source!=='manual'||device.status!=='active')throw new Error('device_context_mismatch');state.device=device;await save();
 const asset=state.asset||await post('asset','/api/owner/meter-assets',{property_id:selected.property_id,label:'PZEM — uji Kamar 1',model:'PZEM-004T',serial_number:null,reason:'Pendaftaran meter untuk uji pembacaan nyata; nomor seri belum tersedia'});
 const installed=(await get('/api/owner/meter-installations?limit=100')).data.filter(meter=>meter.device_id===device.id&&meter.channel_no===1&&!meter.retired_at);
 if(installed.length&&!(installed.length===1&&installed[0].room_id===selected.room_ids[0]&&installed[0].meter_asset_id===asset.id))throw new Error('installation_conflict');
 const installation=state.installation||installed[0]||await post('installation','/api/owner/meter-installations',{meter_asset_id:asset.id,device_id:device.id,kind:'room',room_id:selected.room_ids[0],communal_load_id:null,channel_no:1,installed_at:new Date().toISOString(),reason:'Pemasangan uji PZEM nyata ke Kamar 1, channel 1'});
 state.asset=asset;state.installation=installation;await save();
 const ready=await get(`/api/owner/hardware-readiness?device_uid=${uid}`);
 if(ready.data?.ready!==true)throw new Error('hardware_mapping_not_ready');
 await writeFile(`${directory}/readiness.json`,JSON.stringify(ready,null,2));
 console.info(JSON.stringify({status:'pzem_mapping_ready',device_uid:uid,meter_id:installation.id,room:'Kamar 1',channel_no:1,hardware_readings_generated:0}));
}finally{
 const {csrf}=await get('/api/auth/csrf');await request('/api/auth/logout',{method:'POST',headers:{'x-csrf-token':csrf}});
}
