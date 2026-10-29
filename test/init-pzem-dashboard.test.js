import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import {spawnSync} from 'node:child_process';

test('persiapan firmware Wi-Fi menyertakan header, mempertahankan credential dan menolak identitas berbeda',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'smartbilling-wifi-init-'));
 const source=join(directory,'firmware/pzem-dashboard'),script=resolve('scripts/init-pzem-dashboard.js');
 try{
  await mkdir(join(directory,'firmware/pzem-dashboard'),{recursive:true});
  // The init contract is file/config preparation; synthetic source files keep
  // this test independent from hardware sources excluded from the app image.
  for(const name of ['pzem-dashboard.ino','pzem_frame.h','wifi_profiles.h','wifi_portal.h'])await writeFile(join(source,name),`// isolated source fixture: ${name}\n`);
  await mkdir(join(directory,'.local/pzem-test/ESP32_PZEM_MQTT_Test'),{recursive:true});
  await writeFile(join(directory,'.local/pzem-test/ESP32_PZEM_MQTT_Test/secrets.h'),'#define WIFI_SSID "fixture-old-network"\n#define WIFI_PASSWORD "fixture-old-password"\n');
  const run=()=>spawnSync(process.execPath,[script,'192.168.1.9'],{cwd:directory,encoding:'utf8',env:{...process.env,LOCALAPPDATA:directory}});
  const first=run();assert.equal(first.status,0,first.stderr);
  const sketch=join(directory,'.local/expo-pzem/PZEM_Dashboard');
  let header=await readFile(join(sketch,'secrets.h'),'utf8');
  assert.match(header,/#define WIFI_SETUP_SSID "SmartBilling-Setup-Kamar1"/);
  const setup=await readFile(join(directory,'.local/expo-pzem/wifi-portal/setup_password'),'utf8');assert.match(setup,/^[a-f0-9]{20}$/);
  const device=await readFile(join(directory,'.local/expo-pzem/device_password'),'utf8');
  assert.ok(!first.stdout.includes(setup)&&!first.stdout.includes(device)&&!first.stdout.includes('fixture-old-password'));
  for(const name of ['pzem_frame.h','wifi_profiles.h','wifi_portal.h'])assert.equal(await readFile(join(sketch,name),'utf8'),await readFile(join(source,name),'utf8'));
  header=header.replace('fixture-old-network','fixture-current-network').replace('fixture-old-password','fixture-current-password');
  await writeFile(join(sketch,'secrets.h'),header);
  assert.equal(run().status,0);
  assert.equal(await readFile(join(sketch,'secrets.h'),'utf8'),header);
  assert.equal(await readFile(join(directory,'.local/expo-pzem/wifi-portal/setup_password'),'utf8'),setup);
  assert.equal(await readFile(join(directory,'.local/expo-pzem/device_password'),'utf8'),device);
  const wrongIdentity=header.replace('"10003bd0ccf0"','"10003bb78ff4"');
  await writeFile(join(sketch,'secrets.h'),wrongIdentity);
  assert.notEqual(run().status,0);
  assert.equal(await readFile(join(sketch,'secrets.h'),'utf8'),wrongIdentity);
  await writeFile(join(sketch,'secrets.h'),header.replace(setup,'fixture-secret-mismatch'));
  assert.notEqual(run().status,0);
 }finally{
  // Only remove the exact fresh test directory under the OS temp root.
  assert.equal(dirname(resolve(directory)),resolve(tmpdir()));
  assert.ok(basename(directory).startsWith('smartbilling-wifi-init-'));
  await rm(directory,{recursive:true,force:true});
 }
});
