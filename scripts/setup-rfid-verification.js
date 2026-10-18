import {createPool,requireDevelopment} from '../src/connections.js';
// Only the disposable verification stack. Existing concurrency test expects its
// fixed room to be simulation/read-only, as in the real local demo dataset.
requireDevelopment();
if(process.env.RFID_ISOLATED_TEST!=='1')throw new Error('isolated_verification_required');
const pool=createPool();
try{
 await pool.query("UPDATE rooms SET source='simulation' WHERE id='00000000-0000-4000-8000-000000000003' AND property_id='00000000-0000-4000-8000-000000000002'");
 console.info('Fixture concurrency simulasi terisolasi siap; tidak ada pembacaan baru.');
}finally{await pool.end();}
