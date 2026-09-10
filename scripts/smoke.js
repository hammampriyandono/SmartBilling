import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createPool, createMqtt, requireDevelopment, testTopic, replyPrefix } from '../src/connections.js';

requireDevelopment();
const pool = createPool();
let client;
try {
  const response = await fetch('http://127.0.0.1:3000/health/ready', { signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, 200, 'Backend/DB/MQTT belum siap');
  if (process.argv.includes('--verify-persistence')) {
    const result = await pool.query('SELECT count(*)::int AS count FROM dev_checks.probes');
    assert.ok(result.rows[0].count > 0, 'Belum ada bukti smoke test yang tersimpan');
    console.info(`PASS persistence: ${result.rows[0].count} catatan uji tetap tersimpan.`);
  } else {
    const id = randomUUID();
    client = createMqtt(`a05-smoke-${id}`);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout round trip MQTT')), 15000);
      const finish = (error) => { clearTimeout(timer); error ? reject(error) : resolve(); };
      client.on('error', () => finish(new Error('Koneksi MQTT uji gagal')));
      client.on('message', (topic, bytes) => {
        if (topic !== `${replyPrefix}${id}`) return;
        try {
          assert.deepEqual(JSON.parse(bytes.toString()), { id, kind: 'development-ack' });
          finish();
        } catch (error) { finish(error); }
      });
      client.once('connect', () => client.subscribe(`${replyPrefix}${id}`, { qos: 1 }, (error, granted) => {
        if (error || !granted?.some((entry) => entry.qos <= 1)) return finish(new Error('Subscribe uji gagal'));
        client.publish(testTopic, JSON.stringify({ id, kind: 'development-check' }), { qos: 1, retain: false },
          (publishError) => { if (publishError) finish(new Error('Publish uji gagal')); });
      }));
    });
    await pool.query('CREATE SCHEMA IF NOT EXISTS dev_checks');
    await pool.query(`CREATE TABLE IF NOT EXISTS dev_checks.probes (
      id uuid PRIMARY KEY, kind text NOT NULL CHECK (kind = 'development-check'),
      created_at timestamptz NOT NULL DEFAULT now())`);
    await pool.query('INSERT INTO dev_checks.probes (id, kind) VALUES ($1, $2)', [id, 'development-check']);
    const saved = await pool.query('SELECT id FROM dev_checks.probes WHERE id = $1', [id]);
    assert.equal(saved.rows[0].id, id);
    console.info('PASS: readiness, MQTT publish → backend subscribe → backend publish → subscriber, PostgreSQL tulis/baca.');
  }
} catch {
  console.error('FAIL pemeriksaan lingkungan. Periksa status layanan; detail kredensial tidak dicetak.');
  process.exitCode = 1;
} finally {
  if (client) await client.endAsync(true);
  await pool.end();
}
