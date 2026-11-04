import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import mqtt from 'mqtt';
import { createPool } from '../src/connections.js';
import { hashPassword } from '../src/password.js';

// Run only against the disposable Docker database created by verify-production.
test('production: migration, HTTPS sessions, ACL, ingest/dedup and restart persistence', {
  skip: process.env.RUN_PRODUCTION_SMOKE !== '1' ? 'Memerlukan stack Docker production terisolasi' : false,
  timeout: 45000,
}, async () => {
  assert.equal(process.env.APP_ENV, 'production');
  assert.equal(process.env.PGDATABASE, 'splitzbill_production_smoke');
  const pool = createPool(), clients = [];
  let child;
  const base = 'http://127.0.0.1:3000', origin = process.env.AUTH_ORIGIN;
  async function start() {
    child = spawn(process.execPath, ['src/server.js'], { stdio: 'ignore' });
    for (let i = 0; i < 80; i++) {
      if (child.exitCode !== null) throw Error('production_server_exited');
      try { if ((await fetch(base + '/health/ready')).ok) return; } catch { /* Startup retry. */ }
      await delay(200);
    }
    throw Error('production_server_not_ready');
  }
  async function stop() {
    if (!child || child.exitCode !== null) return;
    const closed = once(child, 'exit'); child.kill('SIGTERM'); await closed; child = undefined;
  }
  async function connect(username, password) {
    const client = mqtt.connect(process.env.MQTT_URL, { username, password, protocolVersion: 5, reconnectPeriod: 0, connectTimeout: 3000 });
    client.on('error', () => {}); clients.push(client); await once(client, 'connect'); return client;
  }
  function browser() {
    let cookie = '';
    return { async request(path, { method = 'GET', body, csrf, requestOrigin = origin, secure = true } = {}) {
      const response = await fetch(base + path, { method, headers: { Cookie: cookie, Origin: requestOrigin,
        ...(secure ? { 'X-Forwarded-Proto': 'https' } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}) }, body: body ? JSON.stringify(body) : undefined });
      const setCookie = response.headers.get('set-cookie');
      if (setCookie) cookie = setCookie.split(';')[0];
      return response;
    } };
  }
  try {
    assert.equal((await pool.query('SELECT current_database() AS name')).rows[0].name, 'splitzbill_production_smoke');
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM users')).rows[0].n, 0);
    const password = randomBytes(24).toString('hex'), hash = await hashPassword(password), owner = randomUUID(), tenant = randomUUID();
    for (const [id, role] of [[owner, 'owner'], [tenant, 'tenant']]) await pool.query(
      'INSERT INTO users(id,name,email,password_hash,role) VALUES($1,$2,$3,$4,$5)', [id, 'FIXTURE PRODUCTION', `${id}@test.invalid`, hash, role]);
    const property = randomUUID(), room = randomUUID(), device = randomUUID(), meter = randomUUID();
    await pool.query("INSERT INTO properties(id,owner_id,name,timezone) VALUES($1,$2,'FIXTURE','Asia/Jakarta')", [property, owner]);
    await pool.query("INSERT INTO rooms(id,property_id,code,name,active_from) VALUES($1,$2,'FIXTURE','FIXTURE','2026-01-01Z')", [room, property]);
    await pool.query("INSERT INTO devices(id,property_id,device_uid,status) VALUES($1,$2,'fixture-sensor','active')", [device, property]);
    await pool.query("INSERT INTO meters(id,property_id,device_id,room_id,kind,channel_no,installed_at,source) VALUES($1,$2,$3,$4,'room',1,'2026-01-01Z','manual')", [meter, property, device, room]);
    await start();
    assert.equal((await (await fetch(base + '/health/live')).json()).environment, 'production');
    assert.equal((await fetch(base + '/api/meters')).status, 401);
    const insecure = await browser().request('/api/auth/csrf', { secure: false });
    assert.equal(insecure.headers.get('set-cookie'), null, 'Secure cookies are not issued on plain HTTP');
    const ownerBrowser = browser(), tenantBrowser = browser();
    for (const [client, id] of [[ownerBrowser, owner], [tenantBrowser, tenant]]) {
      const tokenResponse = await client.request('/api/auth/csrf');
      assert.match(tokenResponse.headers.get('set-cookie'), /; Secure/);
      assert.match(tokenResponse.headers.get('set-cookie'), /; HttpOnly/);
      const csrf = (await tokenResponse.json()).csrf;
      assert.equal((await client.request('/api/auth/login', { method: 'POST', csrf, body: { email: `${id}@test.invalid`, password }, requestOrigin: 'https://wrong.invalid' })).status, 403);
      assert.equal((await client.request('/api/auth/login', { method: 'POST', csrf, body: { email: `${id}@test.invalid`, password } })).status, 200);
    }
    assert.equal((await ownerBrowser.request(`/api/meters/${meter}/latest`)).status, 200);
    assert.equal((await tenantBrowser.request(`/api/meters/${meter}/latest`)).status, 404);
    const sensor = await connect('fixture-sensor', process.env.FIXTURE_SENSOR_PASSWORD);
    // Mosquitto can accept a wildcard subscription and still deny every delivery.
    // Assert the delivered messages, rather than treating SUBACK as read permission.
    let sensorMessages = 0;
    sensor.on('message', () => { sensorMessages++; });
    await sensor.subscribeAsync('smartbilling/v1/devices/+/readings');
    const topic = 'smartbilling/v1/devices/fixture-sensor/readings';
    const payload = JSON.stringify({ schema_version: 1, boot_id: randomUUID(), sequence_no: 1, channel_no: 1,
      counter_epoch: 0, measured_at: new Date().toISOString(), energy_kwh: '0.002', power_w: 12 });
    await sensor.publishAsync(topic, payload, { qos: 1 });
    await sensor.publishAsync(topic, payload, { qos: 1 });
    for (let i = 0; i < 50; i++) {
      if ((await pool.query("SELECT 1 FROM device_quality_events WHERE reason='duplicate_sequence'")).rowCount) break;
      await delay(100);
    }
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM meter_readings')).rows[0].n, 1);
    assert.ok((await pool.query("SELECT 1 FROM device_quality_events WHERE reason='duplicate_sequence'")).rowCount);
    assert.equal(sensorMessages, 0, 'Sensor account has no reading delivery permission');
    await sensor.publishAsync(topic, '{invalid', { qos: 1 });
    for (let i = 0; i < 30 && !(await pool.query("SELECT 1 FROM mqtt_rejections WHERE reason='invalid_json'")).rowCount; i++) await delay(100);
    assert.ok((await pool.query("SELECT 1 FROM mqtt_rejections WHERE reason='invalid_json'")).rowCount);
    // Test write ACLs with MQTT v5 negative PUBACKs, without enabling relay control.
    await assert.rejects(sensor.publishAsync('smartbilling/v1/devices/someone-else/readings', payload, { qos: 1 }));
    const backend = await connect(process.env.MQTT_USERNAME, process.env.MQTT_PASSWORD);
    await assert.rejects(backend.publishAsync('smartbilling/v1/devices/fixture-sensor/relay/commands', '{}', { qos: 1 }));
    await stop(); await start();
    assert.equal((await (await ownerBrowser.request('/api/auth/me')).json()).user.id, owner);
    const reading = await (await ownerBrowser.request(`/api/meters/${meter}/latest`)).json();
    assert.equal(reading.data.energy_kwh, '0.002000000');
    const csrf = (await (await ownerBrowser.request('/api/auth/csrf')).json()).csrf;
    const logout = await ownerBrowser.request('/api/auth/logout', { method: 'POST', csrf });
    assert.equal(logout.status, 204); assert.match(logout.headers.get('set-cookie'), /; Secure/);
    assert.equal((await ownerBrowser.request('/api/auth/me')).status, 401);
  } finally {
    await stop(); await Promise.all(clients.map(client => client.endAsync(true))); await pool.end();
  }
});
