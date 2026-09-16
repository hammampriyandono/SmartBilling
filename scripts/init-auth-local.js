import { mkdir, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
await mkdir('.local/secrets',{recursive:true});
try {await writeFile('.local/secrets/session_secret',randomBytes(48).toString('hex'),{flag:'wx',mode:0o600});}
catch(e) {if(e.code!=='EEXIST') throw e;}
console.info('Session secret lokal tersedia; nilai tidak dicetak dan existing tidak ditimpa.');
