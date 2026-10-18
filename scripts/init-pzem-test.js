import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { isIP } from 'node:net';
import { resolve, join } from 'node:path';

// Input sketch can contain credentials: never log it or error messages from parsing.
const [sourcePath, host] = process.argv.slice(2);
if (!sourcePath || isIP(host) !== 4 || !/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) {
  console.error('Usage: node scripts/init-pzem-test.js <local-source.ino-or-txt> <LAN-IPv4>');
  process.exit(1);
}
try {
  let source = await readFile(sourcePath, 'utf8');
  const getString = name => {
    const match = source.match(new RegExp(`const\\s+char\\s*\\*\\s*${name}\\s*=\\s*("(?:[^"\\\\]|\\\\.)*")\\s*;`));
    if (!match) throw new Error('missing_input_field');
    return JSON.parse(match[1]);
  };
  const ssid = getString('ssid'), wifiPassword = getString('password');
  const directory = resolve('.local/pzem-test');
  const sketchDirectory = join(directory, 'ESP32_PZEM_MQTT_Test');
  await mkdir(sketchDirectory, { recursive: true });
  async function secret(name) {
    const path = join(directory, name);
    try { await writeFile(path, randomBytes(24).toString('hex'), { flag: 'wx', mode: 0o600 }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    const value = (await readFile(path, 'utf8')).trim();
    if (!/^[a-f0-9]{48}$/.test(value)) throw new Error('invalid_existing_secret');
    return value;
  }
  const devicePassword = await secret('device_password');
  await secret('observer_password');
  const header = `#pragma once\n// PRIVATE local configuration. Never commit or share this file.\n#define WIFI_SSID ${JSON.stringify(ssid)}\n#define WIFI_PASSWORD ${JSON.stringify(wifiPassword)}\n#define MQTT_HOST ${JSON.stringify(host)}\n#define MQTT_USERNAME "pzem-kamar2"\n#define MQTT_PASSWORD ${JSON.stringify(devicePassword)}\n`;
  await writeFile(join(sketchDirectory, 'secrets.h'), header, { mode: 0o600 });
  source = source.replace(/const\s+char\s*\*\s*ssid\s*=\s*"(?:[^"\\]|\\.)*"\s*;[^\r\n]*/, 'const char* ssid = WIFI_SSID;');
  source = source.replace(/const\s+char\s*\*\s*password\s*=\s*"(?:[^"\\]|\\.)*"\s*;[^\r\n]*/, 'const char* password = WIFI_PASSWORD;');
  if (!source.includes('IPAddress broker(') || !source.includes('mqtt.connect("ESP32-KAMAR2-PZEM-TEST")')) throw new Error('unsupported_input_sketch');
  source = source.replace('#include <PubSubClient.h>', '#include <PubSubClient.h>\n#include "secrets.h"');
  source = source.replace(/IPAddress broker\([^\r\n]*/, 'const char* broker = MQTT_HOST;');
  source = source.replace('mqtt.connect("ESP32-KAMAR2-PZEM-TEST")', 'mqtt.connect("ESP32-KAMAR2-PZEM-TEST", MQTT_USERNAME, MQTT_PASSWORD)');
  source = source.replace('Serial.println("TES PZEM KE MQTT");', 'Serial.println("TES PZEM KE MQTT - broker diagnostik, belum masuk histori aplikasi");');
  await writeFile(join(sketchDirectory, 'ESP32_PZEM_MQTT_Test.ino'), source);
  await writeFile(join(directory, 'compose.env'), `PZEM_LAN_BIND_IP=${host}\nPZEM_LAN_PORT=1883\n`);
  console.info('PASS: konfigurasi lokal dan sketch autentikasi dibuat di .local/pzem-test; secret tidak ditampilkan.');
} catch {
  console.error('Gagal menyiapkan konfigurasi lokal. Periksa format sketch, IP LAN dan file lokal; isi secret tidak ditampilkan.');
  process.exitCode = 1;
}
