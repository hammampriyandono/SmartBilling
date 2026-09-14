import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createPool, createMqtt, requireDevelopment } from '../src/connections.js';
import { sha256 } from '../src/sensor-message.js';
import { connect, simulate, verifyDataset, dataset, demoMeter, demoTopic, defaultDate, publish, waitFor } from '../src/simulation.js';

requireDevelopment();
const date = process.argv[2] || defaultDate();
const pool = createPool();
const client = createMqtt(`mqtt-integration-${randomUUID()}`);
try {
  await connect(client);
  await simulate(pool, client, date);
  const first = dataset(date)[0];
  const snapshot = async () => (await pool.query(`SELECT count(*)::int AS count,
    md5(string_agg(row_to_json(r)::text, '' ORDER BY id)) AS fingerprint FROM meter_readings r WHERE meter_id=$1`, [demoMeter])).rows[0];
  const before = await snapshot();
  async function rejection(topic, payload, reason, qos = 1) {
    const hash = sha256(payload);
    const previous = (await pool.query('SELECT count(*)::int AS count FROM mqtt_rejections WHERE payload_sha256=$1 AND reason=$2', [hash, reason])).rows[0].count;
    if (qos === 1) await publish(client, topic, payload);
    else await client.publishAsync(topic, payload, { qos, retain: false });
    await waitFor(async () => (await pool.query('SELECT count(*)::int AS count FROM mqtt_rejections WHERE payload_sha256=$1 AND reason=$2', [hash, reason])).rows[0].count > previous);
  }
  await publish(client, demoTopic, JSON.stringify(first));
  // Barrier: rejection logged after duplicate on the same ordered MQTT connection.
  await rejection(demoTopic, JSON.stringify({ ...first, energy_kwh: '0.000000000' }), 'identity_conflict');
  await rejection(demoTopic, JSON.stringify({ ...first, energy_kwh: -1 }), 'invalid_energy_kwh');
  await rejection(demoTopic, '{broken-json', 'invalid_json');
  await rejection(demoTopic, JSON.stringify(first), 'invalid_qos', 0);
  await rejection(demoTopic, JSON.stringify({ ...first, channel_no: 9999 }), 'unmapped_channel_or_time');
  const deviceCount = (await pool.query('SELECT count(*)::int AS count FROM devices')).rows[0].count;
  await rejection('smartbilling/sim/v1/devices/not-registered/readings', JSON.stringify(first), 'unknown_or_inactive_device');
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM devices')).rows[0].count, deviceCount);
  assert.deepEqual(await snapshot(), before, 'Duplikat/penolakan mengubah pembacaan existing');
  await verifyDataset(pool, date);
  async function get(route) {
    const response = await fetch(`http://127.0.0.1:3000${route}`, { signal: AbortSignal.timeout(5000) });
    assert.equal(response.status, 200, route);
    return response.json();
  }
  assert.equal((await get(`/api/meters/${demoMeter}/latest`)).data.meter_id, demoMeter);
  const messages = dataset(date);
  const range = `from=${messages[0].measured_at}&to=${new Date(Date.parse(messages.at(-1).measured_at) + 1).toISOString()}`;
  const history = await get(`/api/meters/${demoMeter}/readings?${range}&limit=1000`);
  assert.equal(history.data.length, 1000);
  const page2 = await get(`/api/meters/${demoMeter}/readings?${range}&limit=1000&cursor=${history.next_cursor}`);
  assert.equal(page2.data.length, 441);
  assert.equal(page2.next_cursor, null);
  const next = new Date(Date.parse(`${date}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  const daily = await get(`/api/meters/${demoMeter}/daily?from=${date}&to=${next}`);
  assert.equal(daily.data[0].status, 'complete');
  assert.equal(daily.data[0].consumption_kwh, '1.440000000');
  assert.equal(daily.data[0].coverage_seconds, 86400);
  assert.equal((await get('/health/ready')).status, 'ready');
  console.info(`PASS MQTT→DB→API SIMULASI ${date}: 1441 sampel; duplikat, konflik, invalid, perangkat asing, channel tak terpetakan; histori 2 halaman; harian 1.440000000 kWh.`);
} catch (error) {
  console.error('FAIL integrasi MQTT', error.code || error.name);
  if (error instanceof assert.AssertionError) console.error(error.message);
  process.exitCode = 1;
} finally { await client.endAsync(true); await pool.end(); }
