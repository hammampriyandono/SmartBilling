import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const base=process.env.AUTH_TEST_BASE_URL||'http://backend:3000';
const origin=process.env.AUTH_ORIGIN||'http://127.0.0.1:3000';
async function login(email,passwordFile){
 const password=(await readFile(passwordFile,'utf8')).trim();let cookie='';
 const request=async(path,options={})=>{
  const response=await fetch(base+path,{signal:AbortSignal.timeout(15000),...options,headers:{Cookie:cookie,Origin:origin,...options.headers}});
  if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
  return response;
 };
 let response=await request('/api/auth/csrf');assert.equal(response.status,200);let {csrf}=await response.json();
 response=await request('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({email,password})});
 assert.equal(response.status,200,`login ${email}`);
 response=await request('/api/auth/csrf');assert.equal(response.status,200);({csrf}=await response.json());
 return{request,csrf};
}
const ok=async(client,path)=>{const response=await client.request(path);assert.equal(response.status,200,path);return response.json();};
const owner=await login('owner@simulation.local',process.env.AUTH_OWNER_PASSWORD_FILE);
const tenant=await login('tenant@simulation.local',process.env.AUTH_TENANT_PASSWORD_FILE);
assert.equal((await ok(owner,'/api/auth/me')).user.role,'owner');
assert.equal((await ok(tenant,'/api/auth/me')).user.role,'tenant');
const rooms=(await ok(tenant,'/api/rooms')).data;assert.ok(rooms.length>0);
const meters=(await ok(tenant,'/api/meters')).data;assert.ok(meters.length>0);
await ok(tenant,'/api/facilities');
await ok(tenant,'/api/usage-sessions?from=2026-09-15T00:00:00Z&to=2026-09-22T00:00:00Z');
await ok(tenant,`/api/meters/${meters[0].id}/latest`);
await ok(tenant,`/api/meters/${meters[0].id}/readings?from=2026-09-11T00:00:00Z&to=2026-09-14T00:00:00Z&limit=5`);
await ok(tenant,`/api/meters/${meters[0].id}/daily?from=2026-09-12&to=2026-09-14`);
assert.ok((await ok(owner,'/api/owner/rooms')).data.length>0);
for(const [path,method] of [['/api/owner','GET'],['/api/owner/rooms','GET'],['/api/owner/rooms','POST']]){
 const response=await tenant.request(path,{method});assert.equal(response.status,403,`${method} ${path}`);assert.equal((await response.json()).error,'owner_required');
}
let response=await fetch(base+'/api/rooms');assert.equal(response.status,401);
response=await tenant.request('/api/auth/logout',{method:'POST',headers:{'X-CSRF-Token':tenant.csrf}});assert.equal(response.status,204);
response=await tenant.request('/api/rooms');assert.equal(response.status,401);
console.info('PASS routing HTTP nyata: tenant monitoring/RFID 200, namespace owner 403, owner admin 200, logout lalu 401.');
