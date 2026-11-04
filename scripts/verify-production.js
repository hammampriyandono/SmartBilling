// Disposable production rehearsal; never uses the existing Compose stacks/cloud.
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { docker } from './local-docker.js';

const root = resolve('.local/production-verification', randomUUID());
await mkdir(root, { recursive: true });
const id = randomUUID().slice(0, 8), network = `splitzbill-production-check-${id}`;
const backendImage = `splitzbill-production-check-backend:${id}`, mqttImage = `splitzbill-production-check-mqtt:${id}`;
const containers = []; let networkCreated = false;
const password = randomBytes(32).toString('hex'), backendPassword = randomBytes(32).toString('hex'), sensorPassword = randomBytes(32).toString('hex');
const mount = (from, to) => ['-v', `${resolve(from)}:${to}:ro`];
async function envFile(name, values) {
  const file = resolve(root, name);
  await writeFile(file, Object.entries(values).map(([k, v]) => `${k}=${v}`).join('\n') + '\n', { flag: 'wx', mode: 0o600 });
  return file;
}
try {
  await docker(['build', '-t', backendImage, '.'], { outputFile: resolve(root, 'backend-build.log') });
  await docker(['build', '-f', 'Dockerfile.mqtt', '-t', mqttImage, '.'], { outputFile: resolve(root, 'mqtt-build.log') });
  await docker(['network', 'create', '--internal', network]); networkCreated = true;
  const pgEnv = await envFile('postgres.env', { POSTGRES_USER: 'smoke', POSTGRES_DB: 'splitzbill_production_smoke', POSTGRES_PASSWORD: password });
  const mqttEnv = await envFile('mqtt.env', { MQTT_BACKEND_USERNAME: 'fixture-backend', MQTT_BACKEND_PASSWORD: backendPassword,
    MQTT_DEVICE_CREDENTIALS: `fixture-sensor|sensor|${sensorPassword}` });
  const appEnv = await envFile('backend.env', { APP_ENV: 'production', PGDATABASE: 'splitzbill_production_smoke',
    DATABASE_URL: `postgresql://smoke:${password}@postgres:5432/splitzbill_production_smoke`, MQTT_URL: 'mqtt://mqtt:1883',
    MQTT_USERNAME: 'fixture-backend', MQTT_PASSWORD: backendPassword, MQTT_CLIENT_ID: 'fixture-backend',
    AUTH_ORIGIN: 'https://splitzbill.example', SESSION_SECRET: randomBytes(48).toString('hex'), ROOM_RELAY_CONTROL_ENABLED: 'false',
    FIXTURE_SENSOR_PASSWORD: sensorPassword, RUN_PRODUCTION_SMOKE: '1' });
  for (const [alias, image, env] of [['postgres', 'postgres:17-alpine', pgEnv], ['mqtt', mqttImage, mqttEnv]]) {
    const container = (await docker(['run', '-d', '--network', network, '--network-alias', alias, '--env-file', env, image])).toString().trim();
    if (!/^[a-f0-9]{64}$/.test(container)) throw Error('invalid_container_id');
    containers.push(container);
  }
  let ready = false;
  for (let i = 0; i < 50; i++) {
    try { await docker(['exec', containers[0], 'pg_isready', '-h', '127.0.0.1', '-U', 'smoke', '-d', 'splitzbill_production_smoke']); ready = true; break; }
    catch { await new Promise(r => setTimeout(r, 200)); }
  }
  if (!ready) throw Error('postgres_not_ready');
  const args = ['run', '--rm', '--network', network, '--env-file', appEnv, backendImage, 'node'];
  await docker([...args, 'scripts/migrate.js'], { outputFile: resolve(root, 'migrate.log') });
  await docker([...args, 'scripts/migrate.js'], { outputFile: resolve(root, 'migrate-repeat.log') });
  await docker([...args, '--test', 'test/production-runtime.test.js'], { outputFile: resolve(root, 'production-test.tap') });
  for (const container of containers) { await docker(['stop', '-t', '5', container]); await docker(['start', container]); }
  const check = "import {createPool} from './src/connections.js';const p=createPool();try{const r=await p.query('SELECT count(*)::int AS n FROM meter_readings');if(r.rows[0].n!==1)throw Error('persistence_failed');console.log('persistence_ok');}finally{await p.end();}";
  await docker([...args, '--input-type=module', '-e', check], { outputFile: resolve(root, 'persistence.log') });
  // Verify the unchanged local FILE-secret path and full auth/tenant scope suite too.
  await docker(['exec', containers[0], 'createdb', '-U', 'smoke', 'smartbilling_dev']);
  const passwordFile = resolve(root, 'postgres-password');
  await writeFile(passwordFile, password, { flag: 'wx', mode: 0o600 });
  const devEnv = await envFile('development.env', { APP_ENV: 'development', PGDATABASE: 'smartbilling_dev', PGUSER: 'smoke',
    PGHOST: 'postgres', PGPASSWORD_FILE: '/run/test/postgres-password', INTEGRATION_DB: '1' });
  const devArgs = ['run', '--rm', '--network', network, '--env-file', devEnv, ...mount(passwordFile, '/run/test/postgres-password'), backendImage, 'node'];
  await docker([...devArgs, 'scripts/migrate.js'], { outputFile: resolve(root, 'development-migrate.log') });
  await docker([...devArgs, '--test', 'test/auth.test.js'], { outputFile: resolve(root, 'development-auth.tap') });
  for (const script of ['scripts/seed-demo.js', 'scripts/simulate.js']) {
    let refused = false;
    try { await docker([...args, script]); } catch { refused = true; }
    if (!refused) throw Error('development_utility_not_blocked');
  }
  const result = await readFile(resolve(root, 'production-test.tap'), 'utf8');
  console.info(result.split('\n').filter(line => /^# (tests|pass|fail|skipped)|^ok /.test(line)).join('\n'));
  console.info('Production Docker: migration idempotent, HTTPS auth/scope, MQTT ACL/ingest/dedup, restart persistence and development guards passed. Local FILE-secret/auth regression passed.');
} catch {
  console.error('Verifikasi production gagal. Periksa log privat .local/production-verification; credential tidak ditampilkan.');
  process.exitCode = 1;
} finally {
  for (const container of containers.reverse()) await docker(['rm', '-f', '-v', container]).catch(() => {});
  if (networkCreated) await docker(['network', 'rm', network]).catch(() => {});
  await docker(['image', 'rm', backendImage, mqttImage]).catch(() => {});
}
