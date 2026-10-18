import {mkdir,writeFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
// Generate throwaway fixture credentials, never read/copy the team's secrets.h.
// Normal runtime provisioning, analogous to init-local.js. No values logged.
const folder=new URL('../.local/secrets/',import.meta.url);await mkdir(folder,{recursive:true});
for(const name of ['rfid_test_a_password','rfid_test_b_password','rfid_test_owner_password']){
 try{await writeFile(new URL(name,folder),randomBytes(32).toString('base64url'),{flag:'wx',mode:0o600});}
 catch(e){if(e.code!=='EEXIST')throw e;}
}
console.info('Secret fixture RFID siap di .local/secrets (nilai tidak ditampilkan).');
