import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = resolve(root, '.local/secrets');
mkdirSync(directory, { recursive: true });
for (const name of ['postgres_password', 'mqtt_password']) {
  const target = resolve(directory, name);
  if (!existsSync(target)) writeFileSync(target, randomBytes(32).toString('hex') + '\n', { flag: 'wx', mode: 0o600 });
}
const envPath = resolve(root, '.env');
if (!existsSync(envPath)) writeFileSync(envPath, 'BACKEND_PORT=3000\n', { flag: 'wx' });
console.info('Konfigurasi lokal siap. Berkas existing dipertahankan; secret tidak ditampilkan.');
