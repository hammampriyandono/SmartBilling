import assert from 'node:assert/strict';
import {authenticatedFetch} from './auth-client.js';

const request=await authenticatedFetch();
const response=await request('/api/owner/device-health');
if(process.env.EXPECT_OWNER_FORBIDDEN==='1'){
 assert.equal(response.status,403);
 console.info(JSON.stringify({tenant_owner_device_health:403}));
 process.exit(0);
}
assert.equal(response.status,200);
const body=await response.json();
assert.ok(Array.isArray(body.data.devices));
assert.ok(Array.isArray(body.data.alerts));
assert.ok(body.data.summary&&body.meta?.thresholds);
assert.ok(body.data.devices.every(device=>typeof device.device_uid==='string'&&Array.isArray(device.meters)));
console.info(JSON.stringify({
 devices:body.data.devices.length,
 active_alerts:body.data.summary.active_alerts,
 status:{online:body.data.summary.online,delayed:body.data.summary.delayed,offline:body.data.summary.offline,never_seen:body.data.summary.never_seen,needs_review:body.data.summary.needs_review},
 thresholds:body.meta.thresholds,
}));
