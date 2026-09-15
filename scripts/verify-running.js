import assert from 'node:assert/strict';
import { createPool, requireDevelopment } from '../src/connections.js';
import { runningMeter } from '../src/running-simulator.js';
import { verifyDataset } from '../src/simulation.js';

requireDevelopment();
const pool=createPool();
try {
  const rows=(await pool.query('SELECT * FROM meter_readings WHERE meter_id=$1 ORDER BY measured_at,id',[runningMeter])).rows;
  assert.ok(rows.length >= 2,'Memerlukan setidaknya dua sampel berjalan');
  let nano=0n, remainder=0n;
  const identities=new Set();
  for(let i=0;i<rows.length;i++) {
    const row=rows[i], key=`${row.boot_id}:${row.sequence_no}`;
    assert.ok(!identities.has(key)); identities.add(key);
    assert.equal(row.counter_epoch,0);
    if(i) {
      const previous=rows[i-1];
      const elapsed=new Date(row.measured_at).getTime()-new Date(previous.measured_at).getTime();
      assert.ok(elapsed > 0);
      const numerator=BigInt(Number(previous.power_w))*BigInt(elapsed)*5n+remainder;
      nano+=numerator/18n; remainder=numerator%18n;
    }
    assert.equal(row.energy_kwh,`${nano/1000000000n}.${String(nano%1000000000n).padStart(9,'0')}`);
  }
  await verifyDataset(pool,'2026-09-12');
  const old=(await pool.query(`SELECT count(*)::int AS count,md5(string_agg(row_to_json(r)::text,'' ORDER BY id)) AS fingerprint
    FROM meter_readings r WHERE meter_id <> $1`,[runningMeter])).rows[0];
  console.info(JSON.stringify({status:'PASS',simulation_samples:rows.length,boots:new Set(rows.map(r=>r.boot_id)).size,
    latest:rows.at(-1).measured_at,energy_kwh:rows.at(-1).energy_kwh,existing_history:old}));
} catch(error) { console.error('FAIL verifikasi simulator',error instanceof assert.AssertionError ? error.message : error.code || error.message); process.exitCode=1; }
finally { await pool.end(); }
