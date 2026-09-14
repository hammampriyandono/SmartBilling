import { readFileSync } from 'node:fs';
import pg from 'pg';
import mqtt from 'mqtt';

export function requireDevelopment() {
  if (process.env.APP_ENV !== 'development' || process.env.PGDATABASE !== 'smartbilling_dev') {
    throw new Error('Utilitas persiapan hanya boleh memakai APP_ENV=development dan database smartbilling_dev.');
  }
}

function secret(name) {
  const path = process.env[`${name}_FILE`];
  if (!path) throw new Error(`Konfigurasi ${name}_FILE belum tersedia.`);
  return readFileSync(path, 'utf8').trim();
}

export function createPool({ timeout = 3000 } = {}) {
  const pool = new pg.Pool({
    password: secret('PGPASSWORD'),
    connectionTimeoutMillis: 3000,
    query_timeout: timeout,
    statement_timeout: timeout,
    max: 5,
  });
  // Hindari mencetak error mentah yang dapat memuat detail koneksi.
  pool.on('error', () => console.warn('Koneksi PostgreSQL terputus; koneksi berikutnya akan dicoba kembali.'));
  return pool;
}

export function createMqtt(clientId, options = {}) {
  return mqtt.connect(process.env.MQTT_URL, {
    clientId,
    username: process.env.MQTT_USERNAME,
    password: secret('MQTT_PASSWORD'),
    reconnectPeriod: 2000,
    connectTimeout: 5000,
    clean: true,
    resubscribe: false,
    queueQoSZero: false,
    ...options,
  });
}

export const testTopic = 'smartbilling/dev-check/request';
export const replyPrefix = 'smartbilling/dev-check/reply/';
