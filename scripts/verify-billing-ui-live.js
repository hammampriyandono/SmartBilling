import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const base=process.env.AUTH_TEST_BASE_URL||'http://backend:3000',origin=process.env.AUTH_ORIGIN||'http://127.0.0.1:3000';
async function login(email,file){const password=(await readFile(file,'utf8')).trim();let cookie='';const request=async(path,options={})=>{const response=await fetch(base+path,{signal:AbortSignal.timeout(15000),...options,headers:{Cookie:cookie,Origin:origin,...options.headers}});const set=response.headers.get('set-cookie');if(set)cookie=set.split(';')[0];return response;};let response=await request('/api/auth/csrf');assert.equal(response.status,200);const {csrf}=await response.json();response=await request('/api/auth/login',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':csrf},body:JSON.stringify({email,password})});assert.equal(response.status,200,email);return request;}
const json=async(request,path)=>{const response=await request(path);assert.equal(response.status,200,path);return response.json();};
const owner=await login('owner@simulation.local',process.env.AUTH_OWNER_PASSWORD_FILE),tenant=await login('tenant@simulation.local',process.env.AUTH_TENANT_PASSWORD_FILE);
const rooms=(await json(owner,'/api/owner/rooms?limit=1000')).data,properties=[...new Set(rooms.map(r=>r.property_id))];assert.ok(properties.length>0,'UI owner memerlukan properti dari kamar scoped');await json(owner,'/api/owner/occupancies');await json(owner,'/api/owner/tenants');
await json(owner,'/api/owner/billing-periods?limit=100');for(const id of properties)await json(owner,`/api/owner/tariff-schedules?property_id=${id}`);
await json(owner,'/api/owner/bill-shares');
const report=await json(owner,'/api/owner/reports/billing');
const tenantPeriods=(await json(tenant,'/api/billing-periods')).data;for(const period of tenantPeriods)await json(tenant,`/api/billing-periods/${period.id}`);
assert.equal((await tenant('/api/owner/billing-periods')).status,403);
assert.equal((await tenant('/api/owner/reports/billing')).status,403);
console.info(`PASS billing/report UI API nyata: ${properties.length} properti owner, endpoint tarif/periode/laporan 200, ${report.meta.row_count} baris laporan, ${tenantPeriods.length} periode final tenant, namespace owner tetap 403.`);
