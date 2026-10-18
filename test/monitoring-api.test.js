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
    if (sql.startsWith('SELECT meters.*')) return { rowCount: parameters[0] === id ? 1 : 0, rows: [{ id, timezone: 'Asia/Jakarta' }] };
    if (sql.includes('meter_readings')) return { rows: [
      { id: '1', measured_at: new Date('2026-09-11T00:00:00Z'), energy_kwh: '1.000000001', data_source: 'simulation' },
      { id: '2', measured_at: new Date('2026-09-11T00:01:00Z'), energy_kwh: '1.000000002', data_source: 'simulation' },
    ] };
    return { rows: [] };
  } };
  const app = express();
  app.use((req,_res,next)=>{req.user={id,role:'owner'};next();});
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
  assert.equal(queries.at(-1).parameters[5], 2);
  assert.match(queries.at(-1).sql, /measured_at < \$3/);
});

test('monitoring: API expose sumber aktual, campuran dan kosong tanpa mengubah scope akses', async t => {
  const id='00000000-0000-4000-8000-000000000005', queries=[];
  let source='production';
  const pool={query:async(sql,parameters)=>{
    queries.push({sql,parameters});
    if(sql.startsWith('SELECT meters.*'))return{rowCount:1,rows:[{id,source:'manual',timezone:'Asia/Jakarta'}]};
    if(sql.includes('FROM meter_readings'))return{rows:source==='empty'?[]:[{id:'1',data_source:source}]};
    return{rows:[{id,source:'manual'}]};
  }};
  const app=express();app.use((req,_res,next)=>{req.user={id,role:'owner'};next();});
  app.use('/api',monitoringApi(pool));app.use(apiError);
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  const get=async path=>(await fetch(`http://127.0.0.1:${server.address().port}/api${path}`)).json();
  const rooms=await get('/rooms');assert.equal(rooms.data[0].source,'manual');assert.equal(rooms.meta.source,'manual');
  assert.match(queries.at(-1).sql,/catalog|EXISTS/);assert.equal(queries.at(-1).parameters[3],id);
  let response=await get(`/meters/${id}/latest`);assert.equal(response.data.data_source,'production');assert.equal(response.meta.source,'production');
  source='simulation';response=await get(`/meters/${id}/latest`);assert.equal(response.meta.source,'simulation');
  source='empty';response=await get(`/meters/${id}/latest`);assert.equal(response.data,null);assert.equal(response.meta.source,'no_data');
});
