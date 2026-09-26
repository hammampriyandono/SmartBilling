import assert from 'node:assert/strict';
import {authenticatedFetch} from './auth-client.js';

const request=await authenticatedFetch();
const uid=process.argv[2]||'sim-running-01',at=process.argv[3]||new Date().toISOString();
const response=await request(`/api/owner/hardware-readiness?device_uid=${encodeURIComponent(uid)}&at=${encodeURIComponent(at)}`);
assert.equal(response.status,200);const {data}=await response.json();assert.equal(data.device.device_uid,uid);assert.ok(Array.isArray(data.installations));assert.ok(Array.isArray(data.issues));assert.equal('password' in data,false);console.info(JSON.stringify({device_uid:uid,ready:data.ready,channels:data.installations.map(x=>x.channel_no),issues:data.issues,checked_at:data.checked_at}));
