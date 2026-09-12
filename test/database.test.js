import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createPool, requireDevelopment } from '../src/connections.js';
import express from 'express';
import { monitoringApi, apiError } from '../src/monitoring-api.js';

test('PostgreSQL: FK, overlap pemasangan, deduplikasi, dan pembacaan immutable', {
  skip: process.env.INTEGRATION_DB !== '1' ? 'Memerlukan PostgreSQL dan migration; set INTEGRATION_DB=1' : false,
}, async () => {
  requireDevelopment();
  const pool = createPool();
  const db = await pool.connect();
  let server;
  try {
    await db.query('BEGIN');
    const owner = randomUUID(), property = randomUUID(), room = randomUUID(), device = randomUUID(), meter = randomUUID();
    await db.query(`INSERT INTO users(id,name,email,password_hash,role,is_active) VALUES ($1,'Uji',$2,'disabled-test-account','owner',false)`, [owner, `${owner}@test.invalid`]);
    await db.query(`INSERT INTO properties(id,owner_id,name,timezone) VALUES ($1,$2,'UJI','Asia/Jakarta')`, [property, owner]);
    await db.query(`INSERT INTO rooms(id,property_id,code,name,active_from) VALUES ($1,$2,'TEST','UJI','2026-01-01T00:00:00Z')`, [room, property]);
    await db.query(`INSERT INTO devices(id,property_id,device_uid,status) VALUES ($1,$2,$3,'active')`, [device, property, device]);
    await db.query(`INSERT INTO meters(id,property_id,device_id,room_id,kind,channel_no,installed_at)
      VALUES ($1,$2,$3,$4,'room',1,'2026-01-01T00:00:00Z')`, [meter, property, device, room]);
    async function rejects(sql, params, code) {
      await db.query('SAVEPOINT invalid_case');
      await assert.rejects(db.query(sql, params), (error) => error.code === code);
      await db.query('ROLLBACK TO SAVEPOINT invalid_case');
      await db.query('RELEASE SAVEPOINT invalid_case');
    }
    await rejects(`INSERT INTO meters(id,property_id,device_id,room_id,kind,channel_no,installed_at)
      VALUES ($1,$2,$3,$4,'room',1,'2026-02-01T00:00:00Z')`, [randomUUID(), property, device, room], '23P01');
    await rejects(`UPDATE meters SET room_id=$1 WHERE id=$2`, [randomUUID(), meter], 'P0001');
    const boot = randomUUID();
    const insert = `INSERT INTO meter_readings(meter_id,boot_id,sequence_no,counter_epoch,measured_at,energy_kwh,quality)
      VALUES ($1,$2,1,0,$3,'0.000000001','valid')`;
    await rejects(insert, [meter, boot, '2025-12-31T00:00:00Z'], 'P0001');
    await db.query(insert, [meter, boot, '2026-09-11T00:00:00Z']);
    await rejects(insert, [meter, boot, '2026-09-11T00:00:00Z'], '23505');
    await rejects('UPDATE meter_readings SET energy_kwh=0 WHERE meter_id=$1', [meter], 'P0001');
    await rejects('DELETE FROM rooms WHERE id=$1', [room], '23503');
    const saved = await db.query('SELECT energy_kwh,power_w FROM meter_readings WHERE meter_id=$1', [meter]);
    assert.deepEqual(saved.rows, [{ energy_kwh: '0.000000001', power_w: null }]);
    await db.query(`INSERT INTO meter_readings(meter_id,boot_id,sequence_no,counter_epoch,measured_at,energy_kwh,quality)
      VALUES ($1,$2,2,0,'2026-09-11T00:01:00Z','0.000000002','valid')`, [meter, boot]);
    // API memakai koneksi transaksi PostgreSQL sungguhan. Fixture di-rollback setelah pengujian.
    const app = express();
    app.use('/api', monitoringApi(db));
    app.use(apiError);
    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    async function get(path) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`);
      assert.equal(response.status, 200, path);
      return response.json();
    }
    const latest = await get(`/meters/${meter}/latest`);
    assert.equal(latest.data.energy_kwh, '0.000000002');
    const path = `/meters/${meter}/readings?from=2026-09-11T00:00:00Z&to=2026-09-12T00:00:00Z&limit=1`;
    const first = await get(path);
    assert.equal(first.data.length, 1);
    assert.ok(first.next_cursor);
    const second = await get(`${path}&cursor=${first.next_cursor}`);
    assert.equal(second.data[0].energy_kwh, '0.000000002');
    assert.equal(second.next_cursor, null);
    const daily = await get(`/meters/${meter}/daily?from=2026-09-11&to=2026-09-12`);
    assert.equal(daily.data[0].consumption_kwh, null);
    assert.equal(daily.data[0].observed_consumption_kwh, '0.000000001');
    assert.equal(daily.data[0].coverage_seconds, 60);
    assert.equal(daily.meta.timezone, 'Asia/Jakarta');
  } finally {
    if (server) await new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); });
    await db.query('ROLLBACK');
    db.release();
    await pool.end();
  }
});
