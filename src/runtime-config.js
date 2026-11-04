import { readFileSync } from 'node:fs';

// Never include a value/path from configuration in an error: URLs may contain credentials.
export function configurationValue(name, { env = process.env, required = true, read = readFileSync } = {}) {
  const direct = env[name], file = env[`${name}_FILE`];
  if (direct !== undefined && file !== undefined) throw new Error(`Konfigurasi ${name} ambigu; pilih environment atau FILE.`);
  let value = direct;
  if (file !== undefined) {
    try { value = read(file, 'utf8').trim(); }
    catch { throw new Error(`Berkas konfigurasi ${name} tidak dapat dibaca.`); }
  }
  if (typeof value !== 'string' || !value.length) {
    if (required) throw new Error(`Konfigurasi ${name} belum tersedia.`);
    return undefined;
  }
  return value;
}

export function runtimeEnvironment(env = process.env) {
  if (!['development', 'production'].includes(env.APP_ENV)) throw new Error('APP_ENV harus development atau production.');
  if (env.APP_ENV === 'development' && (env.PGDATABASE !== 'smartbilling_dev' || env.DATABASE_URL || env.DATABASE_URL_FILE)) {
    throw new Error('Development harus memakai PGDATABASE=smartbilling_dev tanpa DATABASE_URL.');
  }
  return env.APP_ENV;
}

function parsedUrl(value, protocols, name) {
  let url;
  try { url = new URL(value); } catch { /* Return only a fixed error below. */ }
  if (!url || !protocols.includes(url.protocol) || !url.hostname || url.hash) throw new Error(`Konfigurasi ${name} tidak valid.`);
  return url;
}

export function databaseConfiguration(env = process.env, read = readFileSync) {
  const connectionString = configurationValue('DATABASE_URL', { env, read, required: false });
  if (connectionString) {
    const url = parsedUrl(connectionString, ['postgres:', 'postgresql:'], 'DATABASE_URL');
    if (url.pathname.length < 2 || !url.username || !url.password) throw new Error('Konfigurasi DATABASE_URL tidak lengkap.');
    // Keep pg's TLS handling and verification defaults; do not disable verification.
    return { connectionString };
  }
  return { password: configurationValue('PGPASSWORD', { env, read }) };
}

export function mqttConfiguration(env = process.env, read = readFileSync) {
  const url = parsedUrl(env.MQTT_URL, ['mqtt:', 'mqtts:'], 'MQTT_URL');
  if (url.username || url.password || url.search || url.pathname !== '') throw new Error('MQTT_URL hanya boleh berisi protokol, host dan port.');
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(env.MQTT_USERNAME || '')) throw new Error('Konfigurasi MQTT_USERNAME tidak valid.');
  const password = configurationValue('MQTT_PASSWORD', { env, read });
  const ca = configurationValue('MQTT_CA', { env, read, required: false });
  if (ca && url.protocol !== 'mqtts:') throw new Error('MQTT_CA memerlukan MQTT_URL mqtts.');
  return { username: env.MQTT_USERNAME, password, ...(ca ? { ca } : {}), rejectUnauthorized: true };
}

export function httpConfiguration(env = process.env, read = readFileSync) {
  const environment = runtimeEnvironment(env), production = environment === 'production';
  const origin = env.AUTH_ORIGIN || (production ? undefined : 'http://127.0.0.1:3000');
  const url = parsedUrl(origin, production ? ['https:'] : ['http:', 'https:'], 'AUTH_ORIGIN');
  if (url.username || url.password || url.search || url.pathname !== '/' || origin !== url.origin) throw new Error('AUTH_ORIGIN harus berupa origin kanonis tanpa path.');
  const sessionSecret = configurationValue('SESSION_SECRET', { env, read });
  if (sessionSecret.length < 32) throw new Error('SESSION_SECRET harus sedikitnya 32 karakter.');
  const trustProxy = Number(env.TRUST_PROXY_HOPS ?? (production ? 1 : 0));
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(trustProxy) || trustProxy < 0 || trustProxy > 3) throw new Error('TRUST_PROXY_HOPS tidak valid.');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT tidak valid.');
  const mode = env.DATA_MODE || (production ? 'operational' : 'archive');
  if (!['operational', 'archive'].includes(mode) || (production && mode !== 'operational')) throw new Error('Production harus memakai DATA_MODE=operational.');
  return { environment, origin, sessionSecret, trustProxy, port, mode, secureCookie: url.protocol === 'https:',
    host: env.BIND_HOST || (production ? '0.0.0.0' : '127.0.0.1') };
}
