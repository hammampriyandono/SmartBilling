import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { timestamp } from './http-input.js';
import { sameReading, parseSensor } from './sensor-message.js';
import { randomUUID } from 'node:crypto';
import { testTopic, replyPrefix } from './connections.js';

export const demoMeter = '00000000-0000-4000-8000-000000000005';
export const demoTopic = 'smartbilling/sim/v1/devices/sim-device-01/readings';
export const simulationBoot = 'a0500000-0000-4000-8000-000000000001';
export function defaultDate() {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return new Date(Date.parse(`${today}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
}
export function dataset(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < '2026-01-02') throw new Error('Tanggal simulasi harus >= 2026-01-02');
  const start = Date.parse(timestamp(`${date}T00:00:00+07:00`));
  return Array.from({ length: 1441 }, (_, i) => {
    const time = start + i * 60000;
    const sequence = (time - Date.parse('2026-01-01T00:00:00Z')) / 60000;
    const units = 100000n + BigInt(sequence);
    return { schema_version: 1, boot_id: simulationBoot, sequence_no: sequence,
      channel_no: 1, counter_epoch: 0, measured_at: new Date(time).toISOString(),
      energy_kwh: `${units / 1000n}.${String(units % 1000n).padStart(3, '0')}000000`,
      voltage_v: 220, current_a: 0.3, power_w: 60, frequency_hz: 50, power_factor: 0.91 };
  });
}
export async function waitFor(check, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await check()) return; await delay(100); }
  throw new Error('Timeout menunggu hasil ingest');
}
export async function connect(client) {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error('Timeout MQTT')), 10000);
    const finish = (error) => { clearTimeout(timer); client.off('connect', onConnect); client.off('error', onError); error ? reject(error) : resolve(); };
    const onConnect = () => finish();
    const onError = () => finish(new Error('Koneksi MQTT gagal'));
    client.once('connect', onConnect); client.once('error', onError);
    if (client.connected) finish();
  });
  client.on('error', () => {});
}
export function publish(client, topic, bytes) {
  return Promise.race([
    client.publishAsync(topic, bytes, { qos: 1, retain: false }),
    delay(15000, null, { ref: false }).then(() => { throw new Error('Timeout publish'); }),
  ]);
}
async function backendBarrier(client) {
  const id = randomUUID();
  const topic = `${replyPrefix}${id}`;
  await client.subscribeAsync(topic, { qos: 1 });
  try {
    await new Promise((resolve, reject) => {
      const finish = (error) => {
        clearTimeout(timer); client.off('message', handler);
        error ? reject(error) : resolve();
      };
      const handler = (incoming, bytes) => {
        if (incoming !== topic) return;
        try { const value = JSON.parse(bytes.toString()); if (value.id === id && value.kind === 'development-ack') finish(); }
        catch { finish(new Error('Balasan probe invalid')); }
      };
      const timer = setTimeout(() => finish(new Error('Timeout backend barrier')), 15000);
      client.on('message', handler);
      publish(client, testTopic, JSON.stringify({ id, kind: 'development-check' })).catch(finish);
    });
  } finally { await client.unsubscribeAsync(topic); }
}
export async function verifyDataset(pool, date) {
  const messages = dataset(date);
  const result = await pool.query(`SELECT * FROM meter_readings WHERE meter_id=$1 AND boot_id=$2
    AND sequence_no BETWEEN $3 AND $4 ORDER BY sequence_no`,
    [demoMeter, simulationBoot, messages[0].sequence_no, messages.at(-1).sequence_no]);
  assert.equal(result.rowCount, messages.length);
  for (let i = 0; i < messages.length; i++) {
    assert.ok(sameReading(result.rows[i], parseSensor(demoTopic, Buffer.from(JSON.stringify(messages[i]))).reading), `Sampel ${i} berbeda`);
  }
  return messages.length;
}
export async function simulate(pool, client, date) {
  const mapping = await pool.query(`SELECT m.id FROM meters m JOIN devices d ON d.id=m.device_id JOIN properties p ON p.id=m.property_id
    WHERE m.id=$1 AND d.device_uid='sim-device-01' AND d.status='active' AND m.channel_no=1 AND p.timezone='Asia/Jakarta'`, [demoMeter]);
  assert.equal(mapping.rowCount, 1, 'Jalankan seed:demo dan periksa mapping demo');
  const messages = dataset(date);
  // Broker PUBACK acknowledges receipt by broker, not completion of the backend insert.
  // Bound in-flight simulation work and verify each batch in DB to avoid broker queue overflow.
  for (let offset = 0; offset < messages.length; offset += 25) {
    const batch = messages.slice(offset, offset + 25);
    for (const message of batch) await publish(client, demoTopic, JSON.stringify(message));
    // Drain even duplicate batches: existing DB rows alone do not prove replay processing has finished.
    await backendBarrier(client);
    await waitFor(async () => {
      const result = await pool.query(`SELECT count(*)::int AS count FROM meter_readings WHERE meter_id=$1 AND boot_id=$2 AND sequence_no BETWEEN $3 AND $4`,
        [demoMeter, simulationBoot, batch[0].sequence_no, batch.at(-1).sequence_no]);
      return result.rows[0].count === batch.length;
    });
  }
  await waitFor(async () => {
    const result = await pool.query(`SELECT count(*)::int AS count FROM meter_readings WHERE meter_id=$1 AND boot_id=$2 AND sequence_no BETWEEN $3 AND $4`,
      [demoMeter, simulationBoot, messages[0].sequence_no, messages.at(-1).sequence_no]);
    return result.rows[0].count === messages.length;
  }, 60000);
  await verifyDataset(pool, date);
}
