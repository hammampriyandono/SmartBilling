import {spawn} from 'node:child_process';
import {existsSync,createWriteStream} from 'node:fs';
import {join} from 'node:path';
import {pipeline} from 'node:stream/promises';

const bundled=process.env.LOCALAPPDATA&&join(process.env.LOCALAPPDATA,'Programs','DockerDesktop','resources','bin','docker.exe');
const executable=bundled&&existsSync(bundled)?bundled:'docker';
// Binary-safe pipes; never print input, SQL, credentials, or raw Docker stderr.
export async function docker(args,{input,outputFile,structuredErrors=false}={}) {
 const child=spawn(executable,args,{stdio:['pipe','pipe','pipe'],windowsHide:true});
 const chunks=[];child.stderr.resume();
 const completed=new Promise((resolve,reject)=>{child.on('error',()=>reject(new Error('docker_unavailable')));child.on('close',resolve);});
 const output=outputFile?pipeline(child.stdout,createWriteStream(outputFile,{flags:'wx',mode:0o600})):
  (async()=>{for await(const chunk of child.stdout)chunks.push(chunk);})();
 child.stdin.on('error',()=>{});child.stdin.end(input);
 const [code]=await Promise.all([completed,output]);
 if(code!==0){
  let reason='docker_command_failed';
  if(structuredErrors){
   try{
    const result=JSON.parse(Buffer.concat(chunks).toString().trim().split('\n').at(-1));
    if(result.status==='master_transfer_failed'&&/^[a-z_]{1,80}$/.test(result.code))reason=result.code;
   }catch{}
  }
  throw new Error(reason);
 }
 return Buffer.concat(chunks);
}
export const mainCompose=['compose','-p','smartbilling-a05-dev','-f','compose.yaml'];
export const expoCompose=['compose','-p','smartbilling-expo-local','-f','compose.expo-local.yaml'];
