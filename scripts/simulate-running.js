import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createPool, createMqtt, requireDevelopment } from '../src/connections.js';
import { connect } from '../src/simulation.js';
import { ensureRunningMapping, nextCheckpoint, saveCheckpoint, confirmMessage, runningMeter } from '../src/running-simulator.js';

requireDevelopment();
const args = process.argv.slice(2);
const count = Number(args[0] ?? 5), interval = Number(args[1] ?? 60);
if (args.length > 2 || args.some(a => !/^[1-9]\d*$/.test(a)) || !Number.isInteger(count) || count < 1 || count > 60
  || !Number.isInteger(interval) || interval < 1 || interval > 3600 || (count - 1) * interval > 3600) {
  console.error('Pemakaian: node scripts/simulate-running.js [jumlah=5, maks 60] [intervalDetik=60]; rentang maksimal 1 jam.');
  process.exit(1);
}
const stop = new AbortController(), pool = createPool();
let db, client, stopTimer, lockHeld = false;
function shutdown() {
  stop.abort();
  if (client) client.end(true);
  stopTimer ??= setTimeout(() => process.exit(process.exitCode || 0),8000);
}
process.on('SIGINT',shutdown); process.on('SIGTERM',shutdown);
const deadline = setTimeout(shutdown, 3600000);
try {
  db = await pool.connect();
  db.on('error', () => { process.exitCode = 1; shutdown(); });
  lockHeld = (await db.query('SELECT pg_try_advisory_lock(50515105) AS acquired')).rows[0].acquired;
  if (!lockHeld) throw new Error('Simulator untuk meter ini sudah berjalan');
  await ensureRunningMapping(db);
  const saved = await db.query('SELECT checkpoint FROM dev_checks.running_simulator WHERE meter_id=$1',[runningMeter]);
  let checkpoint = saved.rows[0]?.checkpoint || { last:null };
  const latest = (await db.query('SELECT * FROM meter_readings WHERE meter_id=$1 ORDER BY measured_at DESC,id DESC LIMIT 1',[runningMeter])).rows[0];
  if (latest && (!checkpoint.last || new Date(latest.measured_at).getTime() > Date.parse(checkpoint.last.measured_at))) {
    throw new Error('Checkpoint tidak sesuai histori; hentikan tanpa reset counter');
  }
  client = createMqtt(`sim-running-${randomUUID()}`);
  await connect(client);
  const boot = randomUUID(); let sequence = 0;
  console.info(`Simulasi berjalan: ${count} sampel, interval ${interval} detik; meter ${runningMeter}. Bukan hardware.`);
  for (let index = 0; index < count && !stop.signal.aborted; index++) {
    if (!checkpoint.pending) {
      if (index) await delay(Math.max(0,Date.parse(checkpoint.last.measured_at) + interval * 1000 - Date.now()),undefined,{signal:stop.signal});
      stop.signal.throwIfAborted();
      checkpoint = nextCheckpoint(checkpoint,boot,sequence++);
      await saveCheckpoint(db,checkpoint); // Durable before publish, even if process is killed next.
    }
    checkpoint = await confirmMessage(db,client,checkpoint,stop.signal);
    console.info(`TERSIMPAN ${index + 1}/${count} ${checkpoint.last.measured_at} ${checkpoint.last.power_w} W ${checkpoint.last.energy_kwh} kWh`);
  }
} catch (error) {
  if (!stop.signal.aborted) { console.error('Simulator dihentikan:',error.code || error.message); process.exitCode = 1; }
} finally {
  clearTimeout(deadline);
  if (client) await client.endAsync(true).catch(() => {});
  if (db && lockHeld) await db.query('SELECT pg_advisory_unlock(50515105)').catch(() => {});
  db?.release(); await pool.end(); clearTimeout(stopTimer);
  console.info('Simulator berhenti. Checkpoint dan histori dipertahankan.');
}
