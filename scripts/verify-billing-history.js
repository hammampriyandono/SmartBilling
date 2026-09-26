import assert from 'node:assert/strict';
import {createPool,requireDevelopment} from '../src/connections.js';

requireDevelopment();
const pool=createPool();
const legacyFingerprint=async(table,where='')=>(await pool.query(`
 SELECT count(*)::int count,
 md5(string_agg(regexp_replace(row_to_json(r)::text, ',"data_source":"[^"]+"}$', '}'), '' ORDER BY id)) fingerprint
 FROM ${table} r ${where}`)).rows[0];

try{
 const result={
  sessions:await legacyFingerprint('usage_sessions'),
  events:await legacyFingerprint('device_events'),
  readings:await legacyFingerprint('meter_readings'),
  existing:await legacyFingerprint('meter_readings',"WHERE meter_id <> '00000000-0000-4000-8000-000000000304'")
 };
 assert.deepEqual(result,{
  sessions:{count:4,fingerprint:'45732f4a2093e38b28ffe5e0706cde6e'},
  events:{count:8,fingerprint:'71b085ebafe2e3aad388f23b4d3f7fb3'},
  readings:{count:1457,fingerprint:'1e58cd31a8eff1d6c0d8a434cbcbb54a'},
  existing:{count:1450,fingerprint:'3e93b4b5220142a05ef009871618f8cf'}
 });
 console.info(JSON.stringify(result));
}finally{await pool.end();}
