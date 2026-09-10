import express from 'express';
import { randomUUID } from 'node:crypto';
import { createPool, createMqtt, requireDevelopment, testTopic, replyPrefix } from './connections.js';

requireDevelopment();
const pool = createPool();
const client = createMqtt(`a05-backend-${randomUUID()}`);
let subscribed = false;
let stopping = false;
client.on('connect', () => {
  client.subscribe(testTopic, { qos: 1 }, (error, granted) => {
    subscribed = !error && granted?.some((entry) => entry.topic === testTopic && entry.qos <= 1);
    if (subscribed) console.info('MQTT siap untuk pesan uji pengembangan.');
  });
});
for (const event of ['close', 'offline', 'error']) client.on(event, () => { subscribed = false; });
client.on('message', (topic, bytes) => {
  if (topic !== testTopic || bytes.length > 256 || stopping) return;
  try {
    const message = JSON.parse(bytes.toString());
    if (message.kind !== 'development-check' || !/^[a-f0-9-]{36}$/.test(message.id)) return;
    client.publish(`${replyPrefix}${message.id}`, JSON.stringify({ id: message.id, kind: 'development-ack' }),
      { qos: 1, retain: false }, (error) => {
        if (error) console.warn('Balasan MQTT uji gagal dikirim.');
      });
  } catch { /* Payload uji tidak valid diabaikan; ini bukan ingest sensor. */ }
});

const app = express();
app.disable('x-powered-by');
app.get('/health/live', (_req, res) => res.json({ status: 'ok', environment: 'development' }));
app.get('/health/ready', async (_req, res) => {
  let database = false;
  try { await pool.query('SELECT 1'); database = true; } catch { /* Retry pada probe berikutnya. */ }
  const broker = client.connected && subscribed;
  const ready = database && broker && !stopping;
  res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not-ready', database, mqtt: broker });
});
const server = app.listen(Number(process.env.PORT || 3000), '0.0.0.0', () => {
  console.info('Backend minimum berjalan; endpoint /health/live dan /health/ready tersedia.');
});

async function shutdown() {
  if (stopping) return;
  stopping = true;
  const timeout = setTimeout(() => process.exit(1), 8000);
  server.close();
  await client.endAsync();
  await pool.end();
  clearTimeout(timeout);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
