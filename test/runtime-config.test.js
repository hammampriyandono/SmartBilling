import test from 'node:test';
import assert from 'node:assert/strict';
import { configurationValue, runtimeEnvironment, databaseConfiguration, mqttConfiguration, httpConfiguration } from '../src/runtime-config.js';

const production = { APP_ENV: 'production', AUTH_ORIGIN: 'https://splitzbill.example', SESSION_SECRET: 's'.repeat(64) };
test('production uses HTTPS, operational mode, a secure cookie and the proxy/PORT settings', () => {
  const config = httpConfiguration({ ...production, PORT: '4312' });
  assert.equal(config.port, 4312); assert.equal(config.host, '0.0.0.0');
  assert.equal(config.trustProxy, 1); assert.equal(config.secureCookie, true); assert.equal(config.mode, 'operational');
  for (const extra of [{ AUTH_ORIGIN: 'http://localhost:3000' }, { AUTH_ORIGIN: 'https://splitzbill.example/path' },
    { AUTH_ORIGIN: 'https://user:password@splitzbill.example' }, { DATA_MODE: 'archive' }, { PORT: 'NaN' }, { TRUST_PROXY_HOPS: 'true' },
    { SESSION_SECRET: 'short' }, { AUTH_ORIGIN: '' }]) assert.throws(() => httpConfiguration({ ...production, ...extra }));
});
test('local FILE secrets and development defaults remain supported; development cannot target DATABASE_URL', () => {
  const env = { APP_ENV: 'development', PGDATABASE: 'smartbilling_dev', SESSION_SECRET_FILE: 'fixture' };
  assert.equal(httpConfiguration(env, () => ' x'.repeat(32).trim()).secureCookie, false);
  assert.equal(httpConfiguration(env, () => 'x'.repeat(32)).mode, 'archive');
  assert.throws(() => runtimeEnvironment({ ...env, DATABASE_URL: 'postgresql://not-local' }));
  assert.throws(() => runtimeEnvironment({ APP_ENV: 'test' }));
});
test('secret errors redact values and paths, and reject conflicting FILE/environment configuration', () => {
  const privateValue = 'never-output-this-private-value';
  for (const action of [
    () => configurationValue('KEY', { env: { KEY: privateValue, KEY_FILE: privateValue } }),
    () => configurationValue('KEY', { env: { KEY_FILE: privateValue }, read: () => { throw Error(privateValue); } }),
    () => databaseConfiguration({ DATABASE_URL: privateValue }),
  ]) assert.throws(action, error => !error.message.includes(privateValue));
  assert.equal(configurationValue('KEY', { env: { KEY_FILE: 'fixture' }, read: () => ' value\n' }), 'value');
});
test('Railway DATABASE_URL or existing pg password FILE feed pg without disabling TLS', () => {
  const connectionString = 'postgresql://fixture:fixture@postgres.railway.internal:5432/railway';
  assert.deepEqual(databaseConfiguration({ DATABASE_URL: connectionString }), { connectionString });
  assert.deepEqual(databaseConfiguration({ PGPASSWORD_FILE: 'fixture' }, () => 'fixture\n'), { password: 'fixture' });
  assert.throws(() => databaseConfiguration({ DATABASE_URL: 'https://wrong.example/database' }));
});
test('MQTT credentials stay outside URL, verified TLS supports an optional CA', () => {
  const env = { MQTT_URL: 'mqtts://mqtt.example:8883', MQTT_USERNAME: 'backend', MQTT_PASSWORD: 'fixture', MQTT_CA: 'fixture-ca' };
  assert.deepEqual(mqttConfiguration(env), { username: 'backend', password: 'fixture', ca: 'fixture-ca', rejectUnauthorized: true });
  assert.throws(() => mqttConfiguration({ ...env, MQTT_URL: 'mqtt://mqtt:1883' }));
  assert.throws(() => mqttConfiguration({ ...env, MQTT_URL: 'mqtts://secret:password@mqtt.example' }));
});
