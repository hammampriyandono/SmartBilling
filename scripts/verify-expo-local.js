import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {authenticatedFetch} from './auth-client.js';
import {docker,expoCompose} from './local-docker.js';
const base='http://127.0.0.1:3001';
process.env.AUTH_TEST_PASSWORD_FILE='.local/secrets/owner_login_password';
process.env.AUTH_TEST_EMAIL='owner@simulation.local';
process.env.AUTH_ORIGIN=base;
assert.equal((await fetch(base+'/health/ready')).status,200);
assert.equal((await fetch(base+'/api/rooms')).status,401);
const request=await authenticatedFetch(base);
const expected={properties:1,rooms:1,tenants:2,occupancies:2,'rfid-cards':0,facilities:0,devices:0,'meter-assets':0,'meter-installations':0,readers:0};
for(const [resource,count] of Object.entries(expected)){
 const response=await request(`/api/owner/${resource}?limit=100`);assert.equal(response.status,200,resource);
 const {data}=await response.json();assert.equal(data.length,count,resource);
 assert.ok(data.every(row=>row.source!=='simulation'),resource);
}
for(const resource of ['meters','facilities']){
 const response=await request('/api/'+resource);assert.equal(response.status,200);assert.equal((await response.json()).data.length,0);
}
const oldOrigin=await request('/api/auth/login',{method:'POST',headers:{'content-type':'application/json',Origin:'http://127.0.0.1:3000'},body:'{}'});
assert.equal(oldOrigin.status,403);
const csrf=await(await request('/api/auth/csrf')).json();
const logout=await request('/api/auth/logout',{method:'POST',headers:{'x-csrf-token':csrf.csrf}});
assert.equal(logout.status,204);assert.ok(logout.headers.get('set-cookie')?.startsWith('smartbilling.expo.sid='));
const snapshot=JSON.parse((await docker([...expoCompose,'exec','-T','backend','node','scripts/rfid-history-fingerprint.js'])).toString());
for(const table of ['meter_readings','device_events','usage_sessions','meters','devices','communal_loads','rfid_cards','rfid_readers','billing_periods','token_purchases'])assert.equal(snapshot['public.'+table].count,0,table);
assert.equal(snapshot['public.users'].count,3);
const before=await readFile('.local/expo-local/verified-fingerprint.json','utf8').then(JSON.parse).catch(()=>null);
if(before)for(const table of Object.keys(snapshot))if(table!=='public.auth_sessions')assert.deepEqual(snapshot[table],before[table],table);
await writeFile('.local/expo-local/verified-fingerprint.json',JSON.stringify(snapshot,null,2),{mode:0o600});
console.info(JSON.stringify({status:'clean_local_verified',api_counts:expected,simulation_readings:0,live_device_mapping:'not_provisioned',persistent_master_matches:!!before}));
