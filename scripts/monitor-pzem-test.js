import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import mqtt from 'mqtt';

const args = process.argv.slice(2);
const seconds = args.length === 2 && args[0] === '--seconds' ? Number(args[1]) : null;
if (args.length && (!Number.isInteger(seconds) || seconds < 1 || seconds > 3600)) {
  console.error('Pemakaian: node scripts/monitor-pzem-test.js [--seconds 1..3600]');
  process.exit(1);
}
const directory = new URL('../.local/pzem-test/', import.meta.url);
const dataTopic = 'smartbilling/test/pzem/kamar2';
const statusTopic = `${dataTopic}/status`;
const fields = ['voltage_v', 'current_a', 'power_w', 'energy_kwh', 'frequency_hz', 'power_factor'];
const clock = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta', dateStyle: 'short', timeStyle: 'medium'
});
let client, timer, stopping = false, connected = false, dataCount = 0, statusCount = 0;
async function stop() {
  if (stopping) return;
  stopping = true;
  clearTimeout(timer);
  if (client) await client.endAsync(true);
  console.info(`Pemantauan selesai: ${dataCount} pesan sensor, ${statusCount} pesan status.`);
  if (!connected) process.exitCode = 1;
}
try {
  const env = await readFile(new URL('compose.env', directory), 'utf8');
  const host = env.match(/^PZEM_LAN_BIND_IP=([0-9.]+)$/m)?.[1];
  const port = Number(env.match(/^PZEM_LAN_PORT=(\d+)$/m)?.[1] || 1883);
  if (isIP(host) !== 4 || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('invalid_config');
  const password = (await readFile(new URL('observer_password', directory), 'utf8')).trim();
  if (!/^[a-f0-9]{48}$/.test(password)) throw new Error('invalid_secret');
  console.info(`Memantau MQTT ${host}:${port}. Ctrl+C untuk berhenti.`);
  console.info('Waktu = waktu diterima PC (WIB). Pesan tes belum masuk histori/dashboard.');
  client = mqtt.connect(`mqtt://${host}:${port}`, {
    username: 'pzem-observer', password, clientId: `pzem-monitor-${randomUUID()}`,
    protocolVersion: 4, connectTimeout: 5000, reconnectPeriod: 2000,
    clean: true, resubscribe: false
  });
  client.on('connect', () => {
    connected = true;
    client.subscribe([dataTopic, statusTopic], { qos: 0 }, (error, granted) => {
      if (error || granted?.some(item => item.qos === 128)) {
        console.error('Broker menolak subscription. Periksa akun observer.');
        process.exitCode = 1;
        void stop();
        return;
      }
      console.info('Terhubung. Menunggu pesan ESP32...');
    });
  });
  client.on('message', (topic, payload) => {
    if (stopping || payload.length > 4096) return;
    const stamp = clock.format(new Date());
    if (topic === statusTopic) {
      if (payload.toString() !== 'mqtt_connected') return;
      statusCount++;
      console.info(`[${stamp} WIB] ${topic} mqtt_connected`);
    } else if (topic === dataTopic) {
      // Only known numeric measurement fields are printed; no arbitrary payload text.
      let data;
      try { data = JSON.parse(payload.toString()); } catch {}
      if (!data || fields.some(field => typeof data[field] !== 'number' || !Number.isFinite(data[field]))) {
        console.warn(`[${stamp} WIB] Pesan data diterima tetapi format PZEM tidak sesuai.`);
        return;
      }
      dataCount++;
      console.info(`[${stamp} WIB] ${topic} ${JSON.stringify(Object.fromEntries(fields.map(field => [field, data[field]])))}`);
    }
  });
  client.on('error', error => {
    console.error([4, 5, 134, 135].includes(error.code)
      ? 'Login MQTT ditolak. Periksa secret observer lokal.'
      : 'Koneksi MQTT bermasalah. Periksa Docker, IP Wi-Fi, dan firewall.');
  });
  client.on('offline', () => console.warn('Broker terputus; mencoba menyambung kembali.'));
  process.once('SIGINT', () => void stop());
  process.once('SIGTERM', () => void stop());
  if (seconds !== null) timer = setTimeout(() => void stop(), seconds * 1000);
} catch {
  console.error('Gagal memulai monitor. Periksa konfigurasi .local/pzem-test; secret tidak ditampilkan.');
  process.exitCode = 1;
  await stop();
}
