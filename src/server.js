import express from 'express';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { authentication } from './auth.js';
import { setTimeout as delay } from 'node:timers/promises';
import { createPool, createMqtt, requireDevelopment, testTopic, replyPrefix } from './connections.js';
import { monitoringApi, apiError } from './monitoring-api.js';
import { sensorTopic, sensorPrefix } from './sensor-message.js';
import { ingestSensor } from './sensor-ingest.js';
import {rfidTopic} from './rfid-message.js';
import {receiveTap,createRfidWorker} from './rfid-ingest.js';
import {rfidApi} from './rfid-api.js';

requireDevelopment();
const pool = createPool();
const client = createMqtt('smartbilling-simulation-backend-v1', { clean: false });
let subscribed = false;
let stopping = false;
let ingestHealthy = true;
client.on('connect', () => {
  client.subscribe([testTopic, sensorTopic,rfidTopic], { qos: 1 }, (error, granted) => {
    subscribed = !error && [testTopic, sensorTopic,rfidTopic].every((topic) => granted?.some((entry) => entry.topic === topic && entry.qos <= 1));
    if (subscribed) console.info('MQTT siap untuk pesan uji pengembangan.');
  });
});
// MQTT.js sends subscriber PUBACK only after this callback. DB failures keep the message pending.
client.handleMessage = (packet, done) => {
  if (!packet.topic.startsWith(sensorPrefix)) return done();
  (async () => {
    while (!stopping) {
      try {
        if(packet.topic.endsWith('/rfid/taps'))await receiveTap(pool,packet.topic,packet.payload,packet);
        else await ingestSensor(pool, packet.topic, packet.payload, packet);
        ingestHealthy = true;
        done();
        return;
      } catch {
        ingestHealthy = false;
        console.warn('Ingest menunggu database; pesan belum diakui.');
        await delay(2000);
      }
    }
    done(new Error('Backend berhenti sebelum ingest selesai'));
  })().catch(() => { ingestHealthy = false; done(new Error('Ingest gagal')); });
};
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
const workRfid=createRfidWorker(pool,{gap:Number(process.env.MONITORING_MAX_GAP_SECONDS||120)});
let rfidBusy=false,rfidHealthy=true;
async function tickRfid(){if(stopping||rfidBusy)return;rfidBusy=true;try{await workRfid();rfidHealthy=true;}catch{rfidHealthy=false;console.warn('Pemrosesan RFID menunggu database; data inbox dipertahankan.');}finally{rfidBusy=false;}}
const rfidTimer=setInterval(tickRfid,2000);tickRfid();
app.disable('x-powered-by');
const auth=authentication(pool,{secret:readFileSync(process.env.SESSION_SECRET_FILE,'utf8').trim(),origin:process.env.AUTH_ORIGIN||'http://127.0.0.1:3000'});
app.use('/api',(_req,res,next)=>{res.set('Cache-Control','no-store');next();},auth.middleware);
app.use('/api/auth',auth.router);
app.use('/api',auth.requireUser,rfidApi(pool));
app.use('/api',auth.requireUser,monitoringApi(pool, { maxGapSeconds: Number(process.env.MONITORING_MAX_GAP_SECONDS || 120) }));
app.get('/health/live', (_req, res) => res.json({ status: 'ok', environment: 'development' }));
app.get('/health/ready', async (_req, res) => {
  let database = false;
  try { await pool.query('SELECT 1'); database = true; } catch { /* Retry pada probe berikutnya. */ }
  const broker = client.connected && subscribed;
  const ready = database && broker && ingestHealthy && rfidHealthy && !stopping;
  res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not-ready', database, mqtt: broker, ingest: ingestHealthy });
});
app.use(apiError);
app.use(express.static(fileURLToPath(new URL('../dist/', import.meta.url)), { index: 'index.html' }));
const server = app.listen(Number(process.env.PORT || 3000), process.env.BIND_HOST || '127.0.0.1', () => {
  console.info('Backend minimum berjalan; endpoint /health/live dan /health/ready tersedia.');
});

async function shutdown() {
  if (stopping) return;
  stopping = true;
  clearInterval(rfidTimer);
  const timeout = setTimeout(() => process.exit(1), 8000);
  server.close();
  await client.endAsync();
  await auth.store.close();
  await pool.end();
  clearTimeout(timeout);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
