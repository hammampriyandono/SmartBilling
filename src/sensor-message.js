import { createHash } from 'node:crypto';
import { timestamp, uuid } from './http-input.js';

export const sensorTopic = 'smartbilling/sim/v1/devices/+/readings';
export const sensorPrefix = 'smartbilling/sim/v1/devices/';
export const optionalFields = { voltage_v: [8, 4], current_a: [6, 6], power_w: [10, 6], frequency_hz: [6, 4], power_factor: [1, 6] };
export const sha256 = (value) => createHash('sha256').update(value).digest('hex');
export class Rejection extends Error {}

export function parseSensor(topic, bytes, packet = {}) {
  if (bytes.length > 4096) throw new Rejection('payload_too_large');
  if (packet.retain) throw new Rejection('retained_not_allowed');
  if (packet.qos !== undefined && packet.qos !== 1) throw new Rejection('invalid_qos');
  const match = /^smartbilling\/sim\/v1\/devices\/([A-Za-z0-9_-]{1,80})\/readings$/.exec(topic);
  if (!match) throw new Rejection('invalid_topic');
  let value;
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new Rejection('invalid_json'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Rejection('invalid_object');
  const allowed = ['schema_version', 'boot_id', 'sequence_no', 'channel_no', 'counter_epoch', 'measured_at', 'energy_kwh', ...Object.keys(optionalFields)];
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new Rejection('unknown_field');
  if (value.schema_version !== 1) throw new Rejection('invalid_schema_version');
  for (const key of ['sequence_no', 'channel_no', 'counter_epoch']) {
    if (!Number.isSafeInteger(value[key]) || value[key] < 0
      || (key !== 'sequence_no' && value[key] > 2147483647)) throw new Rejection(`invalid_${key}`);
  }
  let boot, measured;
  try { boot = uuid(value.boot_id).toLowerCase(); measured = timestamp(value.measured_at); }
  catch { throw new Rejection('invalid_identity_or_timestamp'); }
  if (typeof value.energy_kwh !== 'string' || !/^(0|[1-9]\d{0,10})(\.\d{1,9})?$/.test(value.energy_kwh)) {
    throw new Rejection('invalid_energy_kwh');
  }
  const [whole, fraction = ''] = value.energy_kwh.split('.');
  const reading = { boot_id: boot, sequence_no: String(value.sequence_no), channel_no: value.channel_no,
    counter_epoch: value.counter_epoch, measured_at: measured, energy_kwh: `${whole}.${fraction.padEnd(9, '0')}` };
  for (const [key, [digits, scale]] of Object.entries(optionalFields)) {
    const number = value[key];
    if (number === undefined || number === null) { reading[key] = null; continue; }
    if (typeof number !== 'number' || !Number.isFinite(number) || number < 0 || number >= 10 ** digits
      || Number(number.toFixed(scale)) !== number || (key === 'power_factor' && number > 1)) throw new Rejection(`invalid_${key}`);
    reading[key] = number.toFixed(scale);
  }
  return { device_uid: match[1], reading };
}

export function sameReading(row, reading) {
  return row.boot_id === reading.boot_id && String(row.sequence_no) === reading.sequence_no
    && row.counter_epoch === reading.counter_epoch && new Date(row.measured_at).toISOString() === reading.measured_at
    && row.energy_kwh === reading.energy_kwh
    && Object.keys(optionalFields).every((field) => row[field] === reading[field]);
}
