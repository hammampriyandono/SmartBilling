import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import mqtt from 'mqtt';

const directory = new URL('../.local/pzem-test/', import.meta.url);
const clients = [];
const dataTopic = 'smartbilling/test/pzem/kamar2';
const statusTopic = `${dataTopic}/status`;
try {
  const env = await readFile(new URL('compose.env', directory), 'utf8');
  const host = env.match(/^PZEM_LAN_BIND_IP=([0-9.]+)$/m)?.[1];
  assert.ok(host, 'missing_local_host');
  const devicePassword = (await readFile(new URL('device_password', directory), 'utf8')).trim();
  const observerPassword = (await readFile(new URL('observer_password', directory), 'utf8')).trim();
  async function connect(credentials = {}, protocolVersion = 5) {
    const client = await mqtt.connectAsync(`mqtt://${host}:1883`, {
      clientId: `pzem-verifier-${randomUUID()}`, reconnectPeriod: 0,
      connectTimeout: 4000, protocolVersion, ...credentials
    });
    client.on('error', () => {});
    clients.push(client);
    return client;
  }
  const observer = await connect({ username: 'pzem-observer', password: observerPassword });
  const received = [];
  observer.on('message', (topic, payload) => received.push({ topic, payload: payload.toString() }));
  await observer.subscribeAsync([dataTopic, statusTopic], { qos: 1 });
  if (process.argv.includes('--watch')) {
    console.info('Menunggu ESP32 selama 30 detik; tidak mencetak credential atau payload.');
    await new Promise(resolve => setTimeout(resolve, 30000));
    const result = {
      checked_at: new Date().toISOString(),
      device_connected_status: received.filter(item => item.topic === statusTopic && item.payload === 'mqtt_connected').length,
      sensor_messages: received.filter(item => item.topic === dataTopic).length
    };
    await writeFile(new URL('last-observation.json', directory), JSON.stringify(result, null, 2));
    console.info(JSON.stringify(result));
  } else {
    // MQTT 3.1.1 matches PubSubClient; no sensor measurements are fabricated.
    const device = await connect({ username: 'pzem-kamar2', password: devicePassword }, 4);
    const deviceReceived = [];
    device.on('message', (topic, payload) => deviceReceived.push({ topic, payload: payload.toString() }));
    await device.subscribeAsync('#', { qos: 1 });
    const marker = `diagnostic:${randomUUID()}`;
    await device.publishAsync(statusTopic, marker, { qos: 1, retain: false });
    const deadline = Date.now() + 3000;
    while (!received.some(item => item.payload === marker) && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    assert.ok(received.some(item => item.topic === statusTopic && item.payload === marker), 'round_trip_missing');
    assert.equal(deviceReceived.length, 0, 'device_must_not_read');
    for (const credentials of [{}, { username: 'pzem-kamar2', password: randomUUID() }]) {
      await assert.rejects(() => connect(credentials), error => error.code === 135, 'authentication_must_fail');
    }
    // MQTT 5 PUBACK exposes ACL rejection; MQTT 3 QoS0 can silently discard it.
    const device5 = await connect({ username: 'pzem-kamar2', password: devicePassword });
    for (const forbidden of ['smartbilling/test/pzem/kamar1', 'smartbilling/v1/devices/forged/readings']) {
      await assert.rejects(() => device5.publishAsync(forbidden, marker, { qos: 1 }), error => error.code === 135);
    }
    await assert.rejects(() => observer.publishAsync(statusTopic, marker, { qos: 1 }), error => error.code === 135);
    console.info('PASS: TCP LAN, MQTT 3.1.1 auth, status round trip, anonymous/wrong-password rejection, read/write ACL. No sensor readings generated.');
  }
} catch (error) {
  console.error(`FAIL: pemeriksaan broker PZEM (${typeof error.code === 'string' ? error.code : 'connection_or_assertion'}). Secret tidak ditampilkan.`);
  process.exitCode = 1;
} finally {
  for (const client of clients) await client.endAsync(true);
}
