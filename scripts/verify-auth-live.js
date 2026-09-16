import assert from 'node:assert/strict';
import {access} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {authenticatedFetch} from './auth-client.js';
const owner=await authenticatedFetch();
const meter='00000000-0000-4000-8000-000000000005';
const json=async(client,path)=>{const r=await client(path);assert.equal(r.status,200,path);return r.json();};
assert.equal((await json(owner,'/api/auth/me')).user.role,'owner');
assert.equal((await json(owner,`/api/meters/${meter}/daily?from=2026-09-12&to=2026-09-13`)).data[0].consumption_kwh,'1.440000000');
process.env.AUTH_TEST_EMAIL='tenant@simulation.invalid';
process.env.AUTH_TEST_PASSWORD_FILE=process.env.AUTH_TENANT_PASSWORD_FILE;
const tenant=await authenticatedFetch();
const list=await json(tenant,'/api/meters');assert.equal(list.data.length,2);assert.ok(list.data.every(m=>m.kind==='room'));
assert.equal((await tenant('/api/meters/00000000-0000-4000-8000-000000000006/latest')).status,404);
const path=`/api/meters/${meter}/readings?from=2026-09-11T17:00:00Z&to=2026-09-12T17:00:00Z&limit=100`;
let rows=[],cursor=null;
do {const page=await json(tenant,path+(cursor?`&cursor=${cursor}`:''));rows.push(...page.data);cursor=page.next_cursor;}while(cursor);
assert.equal(rows.length,720);
assert.equal(rows[0].measured_at,'2026-09-11T23:00:00.000Z');
assert.equal(rows.at(-1).measured_at,'2026-09-12T10:59:00.000Z');
const daily=(await json(tenant,`/api/meters/${meter}/daily?from=2026-09-12&to=2026-09-13`)).data[0];
assert.equal(daily.consumption_kwh,null);assert.equal(daily.observed_consumption_kwh,'0.719000000');assert.equal(daily.sample_count,720);
console.info('PASS owner/tenant pada API existing: 720 sampel tenant, 06:00–17:59 WIB, subtotal 0.719 kWh, total null; meter utama ditolak.');
if(process.argv.includes('--wait-for-restart')) {
  console.info('READY_FOR_RESTART: cookie disimpan hanya dalam memori, tidak dicetak.');
  let ready=false;
  for(let i=0;i<120;i++){try{await access('/tmp/continue-auth-check');ready=true;break;}catch{await delay(1000);}}
  assert.ok(ready,'Tidak ada sinyal lanjut setelah restart');
  assert.equal((await json(owner,'/api/auth/me')).user.role,'owner');
  assert.equal((await json(tenant,'/api/auth/me')).user.role,'tenant');
  console.info('PASS sesi owner dan tenant tetap valid setelah restart backend dengan cookie yang sama.');
}
