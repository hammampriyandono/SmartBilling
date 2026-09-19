import {createPool,requireDevelopment} from '../src/connections.js';
import {provisionRfid,demoRfid} from '../src/rfid-demo.js';
requireDevelopment();const pool=createPool(),db=await pool.connect();
try{await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(5050301)');await provisionRfid(db);await db.query('COMMIT');console.info(JSON.stringify({status:'siap',facility:demoRfid.facility,meter:demoRfid.meter,label:'Fasilitas RFID — Simulasi',card:'UID tidak dicetak'}));}
catch(e){await db.query('ROLLBACK');console.error('Provisioning RFID gagal:',e.code||e.message);process.exitCode=1;}finally{db.release();await pool.end();}
