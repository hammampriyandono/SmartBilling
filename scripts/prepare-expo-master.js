import {readFile,writeFile,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {docker,mainCompose,expoCompose} from './local-docker.js';

const selection=await readFile('.local/expo-local/selection.json');
const temporary=`/tmp/expo-master-${randomUUID()}.json`,target=resolve('.local/expo-local/master-private.json');
try{
 const code=(await readFile('scripts/export-expo-master.js','utf8')).replaceAll("'../src/","'./src/");
 await docker([...mainCompose,'exec','-T','backend','node','--input-type=module','-e',code,'export-expo-master.js',temporary],{input:selection});
 const container=(await docker([...mainCompose,'ps','-q','backend'])).toString().trim();
 await docker(['cp',`${container}:${temporary}`,target]);
 const master=await readFile(target);
 const result=await docker([...expoCompose,'run','--rm','--no-deps','-T','-e','EXPO_LOCAL_BOOTSTRAP=1','backend','node','scripts/bootstrap-expo-master.js'],{input:master});
 await writeFile('.local/expo-local/bootstrap-receipt.json',result,{mode:0o600});
 console.info(result.toString().trim());
}catch{console.error('Persiapan master berhenti tanpa menghapus database. Periksa schema/target kosong/seleksi.');process.exitCode=1;}
finally{
 await docker([...mainCompose,'exec','-T','backend','node','-e',`require('node:fs').unlinkSync(${JSON.stringify(temporary)})`]).catch(()=>{});
 await unlink(target).catch(()=>{});
}
