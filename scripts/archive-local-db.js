import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {docker,mainCompose} from './local-docker.js';

if(process.argv.length!==2)throw new Error('Pemakaian: node scripts/archive-local-db.js');
const directory=resolve('.local','archives',new Date().toISOString().replace(/[:.]/g,'-'));
await mkdir(directory,{recursive:true});
try{
 const fingerprint=JSON.parse((await docker([...mainCompose,'exec','-T','backend','node','scripts/rfid-history-fingerprint.js'])).toString());
 await writeFile(join(directory,'fingerprint.json'),JSON.stringify(fingerprint,null,2),{flag:'wx',mode:0o600});
 const dump=join(directory,'database.dump');
 await docker([...mainCompose,'exec','-T','postgres','pg_dump','-U','smartbilling_dev','-d','smartbilling_dev','-Fc'],{outputFile:dump});
 const content=await readFile(dump);
 if(content.subarray(0,5).toString()!=='PGDMP')throw new Error('invalid_archive');
 const manifest={created_at:new Date().toISOString(),source_project:'smartbilling-a05-dev',database:'smartbilling_dev',format:'postgresql-custom',bytes:content.length,sha256:createHash('sha256').update(content).digest('hex'),restore_verified:false};
 await writeFile(join(directory,'manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx',mode:0o600});
 await mkdir('.local/expo-local',{recursive:true});
 await writeFile('.local/expo-local/latest-archive.json',JSON.stringify({directory}),{mode:0o600});
 console.info(JSON.stringify({status:'backup_created',directory,bytes:manifest.bytes,tables:Object.keys(fingerprint).length,restore_verified:false}));
}catch{console.error('Backup belum dinyatakan siap. Periksa Docker dan layanan lokal; tidak ada data sumber yang diubah.');process.exitCode=1;}
