import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const base=process.env.AUTH_TEST_BASE_URL||'http://127.0.0.1:3000';
async function login(email,password){
 let cookie='';
 const request=async(path,options={})=>{
  const response=await fetch(base+path,{signal:AbortSignal.timeout(15000),...options,headers:{Origin:process.env.AUTH_ORIGIN||base,Cookie:cookie,...options.headers}});
  const setCookie=response.headers.get('set-cookie');if(setCookie)cookie=setCookie.split(';')[0];return response;
 };
 const csrfResponse=await request('/api/auth/csrf');assert.equal(csrfResponse.status,200);
 const {csrf}=await csrfResponse.json();
 return request('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({email,password})});
}
if(process.env.EXPECT_OLD_EMAIL_REJECTED==='1'){
 const results=[];
 for(const [email,file] of [['owner@simulation.invalid',process.env.AUTH_OWNER_PASSWORD_FILE],['tenant@simulation.invalid',process.env.AUTH_TENANT_PASSWORD_FILE]]){
  const password=(await readFile(file,'utf8')).trim(),response=await login(email,password);assert.equal(response.status,401,email);results.push({email,status:response.status});
 }
 console.info(JSON.stringify({legacy_login_rejected:results}));
}else{
 const results=[];
 for(const [email,file] of [['owner@simulation.local',process.env.AUTH_OWNER_PASSWORD_FILE],['tenant@simulation.local',process.env.AUTH_TENANT_PASSWORD_FILE]]){
  const password=(await readFile(file,'utf8')).trim(),response=await login(email,password);assert.equal(response.status,200,email);results.push({email,status:response.status});
 }
 console.info(JSON.stringify({new_login_verified:results}));
}
