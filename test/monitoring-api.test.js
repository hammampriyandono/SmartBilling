import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { monitoringApi, apiError } from '../src/monitoring-api.js';
import { timestamp } from '../src/http-input.js';

test('timestamp menolak tanggal tidak ada dan waktu tanpa zona', () => {
  assert.throws(() => timestamp('2026-02-30T00:00:00Z'));
  assert.throws(() => timestamp('2026-09-11T00:00:00'));
  assert.throws(() => timestamp('2026-09-11T24:00:00Z'));
  assert.equal(timestamp('2026-09-11T07:00:00+07:00'), '2026-09-11T00:00:00.000Z');
});

test('API membatasi input, membedakan meter tidak ada, dan memaginasi histori', async (t) => {
  const id = '00000000-0000-4000-8000-000000000005';
  const queries = [];
  const pool = { query: async (sql, parameters) => {
    queries.push({ sql, parameters });
    if (sql.includes('JOIN properties')) return { rowCount: parameters[0] === id ? 1 : 0, rows: [{ id, timezone: 'Asia/Jakarta' }] };
    if (sql.includes('meter_readings')) return { rows: [
      { id: '1', measured_at: new Date('2026-09-11T00:00:00Z'), energy_kwh: '1.000000001' },
      { id: '2', measured_at: new Date('2026-09-11T00:01:00Z'), energy_kwh: '1.000000002' },
    ] };
    return { rows: [] };
  } };
  const app = express();
  app.use('/api', monitoringApi(pool)); app.use(apiError);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const get = (path) => fetch(`http://127.0.0.1:${server.address().port}/api${path}`);
  assert.equal((await get('/rooms?limit=1001')).status, 400);
  assert.equal((await get('/meters?after=bad')).status, 400);
  assert.equal((await get('/meters/bad/latest')).status, 400);
  assert.equal((await get('/meters/00000000-0000-4000-8000-000000000099/latest')).status, 404);
  assert.equal((await get(`/meters/${id}/readings?from=2026-09-11&to=2026-09-12`)).status, 400);
  const response = await get(`/meters/${id}/readings?from=2026-09-11T00:00:00Z&to=2026-09-12T00:00:00Z&limit=1`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.length, 1);
  assert.equal(body.data[0].energy_kwh, '1.000000001');
  assert.equal(body.meta.source, 'simulation');
  assert.ok(body.next_cursor);
  assert.equal(queries.at(-1).parameters.at(-1), 2);
  assert.match(queries.at(-1).sql, /measured_at < \$3/);
});
