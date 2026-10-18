// Read-only business verification. Login/logout changes only temporary sessions;
// mutation probes are deliberately rejected before any transaction is started.
import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {authenticatedFetch} from './auth-client.js';
const base=process.env.AUTH_TEST_BASE_URL||'http://127.0.0.1:3000';
const ownerFile=process.env.AUTH_OWNER_PASSWORD_FILE,tenantFile=process.env.AUTH_TENANT_PASSWORD_FILE;
if(!ownerFile||!tenantFile)throw new Error('Owner/tenant password file paths required');
let owner,tenant;
async function logout(request){if(!request)return;const {csrf}=await(await request('/api/auth/csrf')).json();assert.equal((await request('/api/auth/logout',{method:'POST',headers:{'X-CSRF-Token':csrf}})).status,204);}
try{
 process.env.AUTH_TEST_EMAIL='owner@simulation.local';process.env.AUTH_TEST_PASSWORD_FILE=ownerFile;owner=await authenticatedFetch(base);
 const propertiesResponse=await owner('/api/owner/properties?limit=100');assert.equal(propertiesResponse.status,200);const {data:properties}=await propertiesResponse.json();assert.ok(properties.length);
 for(const p of properties){const month=new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',timeZone:p.timezone}).formatToParts(new Date());const value=`${month.find(x=>x.type==='year').value}-${month.find(x=>x.type==='month').value}`,query=new URLSearchParams({property_id:p.id,month:value});
  const response=await owner(`/api/owner/monthly-token-summary?${query}`);assert.equal(response.status,200);const {data}=await response.json();assert.equal(data.timezone,p.timezone);assert.equal(data.period_rule,'wholly_contained_local_month');assert.equal(data.payment_basis,'current_status_not_cash_flow');assert.match(data.token_total_rp,/^\d+$/);
  if(data.final_period_count===0){assert.equal(data.tenant_total_rp,null);assert.equal(data.difference_rp,null);}else if(data.tenant_total_rp!==null)assert.equal(data.difference_rp,String(BigInt(data.token_total_rp)-BigInt(data.tenant_total_rp)));
  assert.equal((await owner(`/api/owner/token-purchases?${query}`)).status,200);
 }
 const body={property_id:properties[0].id,purchase_date:'2026-10-01',amount_rp:'1',note:null};
 assert.equal((await owner('/api/owner/token-purchases',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':randomUUID()},body:JSON.stringify(body)})).status,403);
 const {csrf}=await(await owner('/api/auth/csrf')).json();assert.equal((await owner('/api/owner/token-purchases',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify(body)})).status,400);
 assert.equal((await owner(`/api/owner/monthly-token-summary?property_id=${randomUUID()}&month=2026-10`)).status,404);
 process.env.AUTH_TEST_EMAIL='tenant@simulation.local';process.env.AUTH_TEST_PASSWORD_FILE=tenantFile;tenant=await authenticatedFetch(base);
 for(const [path,method] of [['/api/owner/token-purchases','GET'],['/api/owner/token-purchases','POST'],[`/api/owner/token-purchases/${randomUUID()}`,'PATCH'],[`/api/owner/token-purchases/${randomUUID()}/cancel`,'POST'],['/api/owner/monthly-token-summary','GET']])assert.equal((await tenant(path,{method})).status,403);
 for(const path of ['/api/rooms','/api/meters','/api/facilities','/api/billing-periods'])assert.equal((await tenant(path)).status,200);
 assert.equal((await fetch(base+'/api/owner/monthly-token-summary')).status,401);assert.equal((await fetch(base+'/health/ready')).status,200);
 console.info(`PASS HTTP token: ${properties.length} properti owner 200, properti asing 404, tenant 403, anonymous 401, CSRF/key required, monitoring/billing tenant 200; tanpa pembelian/tagihan baru.`);
}finally{await logout(owner);await logout(tenant);}
