import assert from 'node:assert/strict';
import { parseSensor, sameReading } from './sensor-message.js';
import { publish } from './simulation.js';
import { setTimeout as delay } from 'node:timers/promises';

export const runningMeter = '00000000-0000-4000-8000-000000000105';
export const runningDevice = '00000000-0000-4000-8000-000000000104';
export const runningRoom = '00000000-0000-4000-8000-000000000103';
export const runningTopic = 'smartbilling/sim/v1/devices/sim-running-01/readings';
const property = '00000000-0000-4000-8000-000000000002';

export async function ensureRunningMapping(db) {
  await db.query('BEGIN');
  try {
    await db.query(`INSERT INTO rooms(id,property_id,code,name,active_from)
      VALUES ($1,$2,'SIM-RUN','Simulasi berjalan','2026-01-01T00:00:00Z') ON CONFLICT(id) DO NOTHING`, [runningRoom, property]);
    await db.query(`INSERT INTO devices(id,property_id,device_uid,status)
      VALUES ($1,$2,'sim-running-01','active') ON CONFLICT(id) DO NOTHING`, [runningDevice, property]);
    await db.query(`INSERT INTO meters(id,property_id,device_id,room_id,kind,channel_no,installed_at)
      VALUES ($1,$2,$3,$4,'room',1,'2026-01-01T00:00:00Z') ON CONFLICT(id) DO NOTHING`, [runningMeter, property, runningDevice, runningRoom]);
    const mapping = await db.query(`SELECT m.id FROM meters m JOIN rooms r ON r.id=m.room_id JOIN devices d ON d.id=m.device_id
      WHERE m.id=$1 AND m.property_id=$2 AND m.device_id=$3 AND m.room_id=$4 AND m.kind='room' AND m.channel_no=1
      AND m.retired_at IS NULL AND m.installed_at='2026-01-01T00:00:00Z' AND r.name='Simulasi berjalan'
      AND r.code='SIM-RUN' AND d.device_uid='sim-running-01' AND d.status='active'`, [runningMeter, property, runningDevice, runningRoom]);
    assert.equal(mapping.rowCount,1,'Mapping existing berbeda; simulator dihentikan tanpa menimpanya');
    await db.query('COMMIT');
  } catch (error) { await db.query('ROLLBACK'); throw error; }
}

export function nextCheckpoint(previous, boot, sequence, now = Date.now()) {
  let units = 0n, remainder = 0n, step = 0;
  if (previous.last) {
    const elapsed = now - Date.parse(previous.last.measured_at);
    if (!Number.isSafeInteger(elapsed) || elapsed <= 0) throw new Error('Clock tidak maju; counter tidak diubah');
    const [whole, fraction] = previous.last.energy_kwh.split('.');
    // W × milliseconds × 5 / 18 = nano-kWh. Preserve fractional remainder across restarts.
    const numerator = BigInt(previous.last.power_w) * BigInt(elapsed) * 5n + BigInt(previous.remainder);
    units = BigInt(whole) * 1000000000n + BigInt(fraction) + numerator / 18n;
    remainder = numerator % 18n;
    step = previous.step + 1;
  }
  // Piecewise constant virtual load: this value holds until the next measurement,
  // including offline time. Gaps remain gaps in backend daily quality calculations.
  const power = [60,120,90,180,75,150][step % 6];
  const payload = { schema_version:1, boot_id:boot, sequence_no:sequence, channel_no:1, counter_epoch:0,
    measured_at:new Date(now).toISOString(), energy_kwh:`${units / 1000000000n}.${String(units % 1000000000n).padStart(9,'0')}`,
    voltage_v:220, current_a:Number((power / (220 * 0.95)).toFixed(6)), power_w:power, frequency_hz:50, power_factor:0.95 };
  parseSensor(runningTopic,Buffer.from(JSON.stringify(payload)));
  return { last:payload, remainder:String(remainder), step, pending:true };
}

export async function saveCheckpoint(db, checkpoint) {
  await db.query(`INSERT INTO dev_checks.running_simulator(meter_id,checkpoint) VALUES($1,$2)
    ON CONFLICT(meter_id) DO UPDATE SET checkpoint=EXCLUDED.checkpoint,updated_at=now()`, [runningMeter, checkpoint]);
}

export async function confirmMessage(db, client, checkpoint, signal) {
  const payload = checkpoint.last;
  const normalized = parseSensor(runningTopic,Buffer.from(JSON.stringify(payload))).reading;
  // Three bounded delivery attempts. Each publishes the same bytes and identity.
  for (let attempt = 0; attempt < 3; attempt++) {
    signal.throwIfAborted();
    try { await publish(client, runningTopic, JSON.stringify(payload)); }
    catch (error) {
      signal.throwIfAborted();
      if (attempt === 2) throw new Error('Publish timeout/gagal; pesan pending dipertahankan');
      await delay(1000,undefined,{signal});
      continue;
    }
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      signal.throwIfAborted();
      const result = await db.query('SELECT * FROM meter_readings WHERE meter_id=$1 AND boot_id=$2 AND sequence_no=$3',
        [runningMeter, payload.boot_id, payload.sequence_no]);
      if (result.rowCount) {
        assert.ok(sameReading(result.rows[0],normalized),'Konflik isi; checkpoint dipertahankan untuk pemeriksaan');
        const confirmed = { ...checkpoint, pending:false };
        await saveCheckpoint(db, confirmed);
        return confirmed;
      }
      await delay(250,undefined,{signal});
    }
  }
  throw new Error('Konfirmasi ingest timeout; pesan pending disimpan untuk restart');
}
