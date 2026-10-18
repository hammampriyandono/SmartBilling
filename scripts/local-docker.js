import {spawn} from 'node:child_process';
import {existsSync,createWriteStream} from 'node:fs';
import {join} from 'node:path';
import {pipeline} from 'node:stream/promises';

const bundled=process.env.LOCALAPPDATA&&join(process.env.LOCALAPPDATA,'Programs','DockerDesktop','resources','bin','docker.exe');
const executable=bundled&&existsSync(bundled)?bundled:'docker';
// Binary-safe pipes; never print input, SQL, credentials, or raw Docker stderr.
export async function docker(args,{input,outputFile}={}) {
 const child=spawn(executable,args,{stdio:['pipe','pipe','pipe'],windowsHide:true});
 const chunks=[];child.stderr.resume();
 const completed=new Promise((resolve,reject)=>{child.on('error',()=>reject(new Error('docker_unavailable')));child.on('close',code=>code===0?resolve():reject(new Error('docker_command_failed')));});
 const output=outputFile?pipeline(child.stdout,createWriteStream(outputFile,{flags:'wx',mode:0o600})):
  (async()=>{for await(const chunk of child.stdout)chunks.push(chunk);})();
 child.stdin.on('error',()=>{});child.stdin.end(input);
 await Promise.all([completed,output]);return Buffer.concat(chunks);
}
export const mainCompose=['compose','-p','smartbilling-a05-dev','-f','compose.yaml'];
export const expoCompose=['compose','-p','smartbilling-expo-local','-f','compose.expo-local.yaml'];
