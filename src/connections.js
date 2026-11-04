import pg from 'pg';
import mqtt from 'mqtt';
import { databaseConfiguration, mqttConfiguration } from './runtime-config.js';

export function requireDevelopment() {
  if (process.env.APP_ENV !== 'development' || process.env.PGDATABASE !== 'smartbilling_dev' || process.env.DATABASE_URL || process.env.DATABASE_URL_FILE) {
    throw new Error('Utilitas persiapan hanya boleh memakai APP_ENV=development dan database smartbilling_dev.');
  }
}

export function createPool({ timeout = 3000 } = {}) {
  const pool = new pg.Pool({
    ...databaseConfiguration(),
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
    ...mqttConfiguration(),
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
