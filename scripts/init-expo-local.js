import {mkdir,writeFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
await mkdir('.local/expo-local/secrets',{recursive:true});
for(const name of ['postgres_password','mqtt_password','session_secret']) {
 try{await writeFile(`.local/expo-local/secrets/${name}`,randomBytes(48).toString('hex'),{flag:'wx',mode:0o600});}
 catch(error){if(error.code!=='EEXIST')throw error;}
}
// Only the manual master data explicitly selected by the user on 18 October.
const selection={owner_id:'00000000-0000-4000-8000-000000000001',property_id:'00000000-0000-4000-8000-000000000002',room_ids:['4d14d6dd-d4f3-40e3-b077-6a028b73ab16'],tenant_ids:['9376bdcb-8cd8-4bd1-b08f-5bd2d25fde70','d9bbf12e-b523-4ba1-a199-f40cd3492601']};
try{await writeFile('.local/expo-local/selection.json',JSON.stringify(selection,null,2),{flag:'wx',mode:0o600});}
catch(error){if(error.code!=='EEXIST')throw error;}
console.info('Konfigurasi rehearsal lokal siap; secret existing tidak ditimpa.');
