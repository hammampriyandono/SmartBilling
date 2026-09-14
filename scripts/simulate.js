import { randomUUID } from 'node:crypto';
import { createPool, createMqtt, requireDevelopment } from '../src/connections.js';
import { connect, simulate, verifyDataset, defaultDate, demoMeter } from '../src/simulation.js';

requireDevelopment();
const args = process.argv.slice(2);
if (args.filter((arg) => arg !== '--verify-only').length > 1
    || args.some((arg) => arg !== '--verify-only' && !/^\d{4}-\d{2}-\d{2}$/.test(arg))) {
  console.error('Pemakaian: npm run simulate -- [YYYY-MM-DD] [--verify-only]');
  process.exit(1);
}
const date = args.find((arg) => /^\d{4}-\d{2}-\d{2}$/.test(arg)) || defaultDate();
const pool = createPool();
let client;
try {
  if (args.includes('--verify-only')) await verifyDataset(pool, date);
  else {
    client = createMqtt(`simulator-${randomUUID()}`);
    await connect(client);
    await simulate(pool, client, date);
  }
  console.info(`PASS SIMULASI ${date}: 1441 pembacaan per menit, meter ${demoMeter}. Bukan pengamatan hardware.`);
} catch (error) {
  console.error('Simulasi/verifikasi gagal; data existing dipertahankan.', error.code || 'simulation_failed');
  process.exitCode = 1;
} finally {
  if (client) await client.endAsync(true);
  await pool.end();
}
