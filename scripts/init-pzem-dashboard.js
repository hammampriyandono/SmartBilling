import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {isIP} from 'node:net';
import {join,resolve} from 'node:path';
const host=process.argv[2],uid='esp32-pzem-10003bd0ccf0';
if(isIP(host)!==4||!host.startsWith('192.168.1.'))throw new Error('expected_verified_wifi_ipv4');
const root=resolve('.local/expo-pzem'),sketch=join(root,'PZEM_Dashboard');
await mkdir(sketch,{recursive:true});
await mkdir(join(root,'extra-devices'),{recursive:true});
await mkdir(join(root,'wifi-portal'),{recursive:true});
const old=await readFile(join(sketch,'secrets.h'),'utf8').catch(error=>{if(error.code!=='ENOENT')throw error;return readFile('.local/pzem-test/ESP32_PZEM_MQTT_Test/secrets.h','utf8');});
function setting(name){const m=old.match(new RegExp(`^#define ${name} ("(?:[^"\\\\]|\\\\.)*")$`,'m'));if(!m)throw new Error('wifi_config_missing');return JSON.parse(m[1]);}
if(/^#define DEVICE_UID /m.test(old)&&(setting('DEVICE_UID')!==uid||setting('EXPECTED_MAC_HEX')!=='10003bd0ccf0'))throw new Error('existing_device_identity_mismatch');
async function secret(name,bytes=24){const p=join(root,name);try{await writeFile(p,randomBytes(bytes).toString('hex'),{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;}const value=(await readFile(p,'utf8')).trim();if(!new RegExp(`^[a-f0-9]{${bytes*2}}$`).test(value))throw new Error('invalid_secret_file');return value;}
const password=await secret('device_password');await secret('observer_password');
const setupPassword=await secret('wifi-portal/setup_password',10),setupSsid=/^#define WIFI_SETUP_SSID /m.test(old)?setting('WIFI_SETUP_SSID'):'SmartBilling-Setup-Kamar1';
if(/^#define WIFI_SETUP_PASSWORD /m.test(old)&&setting('WIFI_SETUP_PASSWORD')!==setupPassword)throw new Error('existing_setup_secret_mismatch');
await writeFile(join(sketch,'secrets.h'),`#pragma once\n// Private LAN test configuration. Never commit or print.\n#define WIFI_SSID ${JSON.stringify(setting('WIFI_SSID'))}\n#define WIFI_PASSWORD ${JSON.stringify(setting('WIFI_PASSWORD'))}\n#define WIFI_SETUP_SSID ${JSON.stringify(setupSsid)}\n#define WIFI_SETUP_PASSWORD ${JSON.stringify(setupPassword)}\n#define MQTT_HOST ${JSON.stringify(host)}\n#define MQTT_PORT 1884\n#define DEVICE_UID "${uid}"\n#define EXPECTED_MAC_HEX "10003bd0ccf0"\n#define MQTT_USERNAME "${uid}"\n#define MQTT_PASSWORD "${password}"\n#define SAMPLE_INTERVAL_MS 60000UL\n`,{mode:0o600});
await copyFile('firmware/pzem-dashboard/pzem-dashboard.ino',join(sketch,'PZEM_Dashboard.ino'));
for(const name of ['pzem_frame.h','wifi_profiles.h','wifi_portal.h'])await copyFile(`firmware/pzem-dashboard/${name}`,join(sketch,name));
await writeFile(join(root,'compose.env'),`PZEM_DASHBOARD_BIND_IP=${host}\nPZEM_DASHBOARD_PORT=1884\nPZEM_DASHBOARD_UID=${uid}\n`);
const slash=value=>value.replaceAll('\\','/');
const config={directories:{data:slash(join(process.env.LOCALAPPDATA,'Arduino15')),downloads:slash(join(root,'downloads')),user:slash(join(root,'arduino-user'))}};
await writeFile(join(root,'arduino-cli.yaml'),JSON.stringify(config,null,2));
console.info(JSON.stringify({status:'private_firmware_config_ready',sketch,host,port:1884,device_uid:uid,channel_no:1,sample_seconds:60}));
