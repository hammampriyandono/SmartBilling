import {createPool,requireDevelopment} from '../src/connections.js';
import {deviceReadiness} from '../src/hardware-readiness.js';

requireDevelopment();
const [deviceUid,ownerId,at]=process.argv.slice(2);
if(!deviceUid||!ownerId)throw new Error('Pemakaian: node scripts/verify-device-readiness.js <device_uid> <owner_uuid> [RFC3339]');
const pool=createPool();
try{const result=await deviceReadiness(pool,{ownerId,deviceUid,at:at||new Date().toISOString()});if(!result)throw new Error('Device tidak ditemukan dalam scope owner');console.info(JSON.stringify(result,null,2));if(!result.ready)process.exitCode=2;}finally{await pool.end();}
