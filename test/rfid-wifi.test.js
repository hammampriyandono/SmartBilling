import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../firmware/rfid-pzem-v42-sesi/rfid-pzem-v42-sesi.ino',import.meta.url),'utf8');
function body(name){
 const start=source.indexOf('{',source.indexOf(`void ${name}(`));
 assert.ok(start>=0);let depth=1,end=start+1;
 for(;depth&&end<source.length;end++){if(source[end]==='{')depth++;else if(source[end]==='}')depth--;}
 assert.equal(depth,0);
 return source.slice(start+1,end-1)
  .replace(/const char \*(ssid|password) =/g,'const $1 =')
  .replace('bool connected =','const connected =')
  .replaceAll('sizeof(WIFI_FALLBACK_SSID)','(WIFI_FALLBACK_SSID.length + 1)')
  .replaceAll('.c_str()','')
  .replace(/^#(?:if ENABLE_MQTT|endif)\s*$/gm,'');
}
function rig({fallback='hotspot',configured=true}={}){
 const c={WIFI_SSID:'home',WIFI_PASSWORD:'test-home',WIFI_FALLBACK_SSID:fallback,WIFI_FALLBACK_PASSWORD:'test-hotspot',
  wifiConfigured:configured,wifiUseFallback:false,wifiLastTry:0,wifiWasConnected:false,WIFI_RETRY_MS:20000,
  WIFI_STA:1,WL_CONNECTED:3,now:0,connected:false,oledDirty:false,mqttLastTry:9,calls:[],networkTicks:0,beeps:0,notices:0,
  Serial:{printf(){},println(){}},mqtt:{disconnect(){}}};
 c.millis=()=>c.now;c.WiFi={mode(){},setAutoReconnect(){},setSleep(){},disconnect(...args){assert.deepEqual(args,[false,false]);},
  begin(ssid,password){c.calls.push({ssid,password,at:c.now});},status:()=>c.connected?3:0,localIP:()=>({toString:()=>''}),RSSI:()=>-50};
 c.updateMQTT=()=>c.networkTicks++;c.startSuccessBeep=()=>c.beeps++;c.showOledNotice=()=>c.notices++;
 vm.createContext(c);
 vm.runInContext(['wifiConnect','initWiFi','onButtonPressed','updateWiFi'].map(n=>`function ${n}(${n==='wifiConnect'?'reason':''}){${body(n)}}`).join('\n'),c);
 return c;
}
test('RFID tries the second Wi-Fi after the existing retry deadline, then tries the first again',()=>{
 const c=rig();c.initWiFi();assert.equal(c.calls[0].ssid,'home');
 c.now=19999;c.updateWiFi();assert.equal(c.calls.length,1);
 c.now=20000;c.updateWiFi();assert.equal(c.calls[1].ssid,'hotspot');assert.equal(c.calls[1].password,'test-hotspot');
 c.now=40000;c.updateWiFi();assert.equal(c.calls[2].ssid,'home');assert.equal(c.calls[2].password,'test-home');
});
test('RFID keeps a working fallback connection while other loop work continues',()=>{
 const c=rig();c.initWiFi();c.now=20000;c.updateWiFi();c.connected=true;
 for(const now of [21000,60000,120000]){c.now=now;c.updateWiFi();}
 assert.equal(c.calls.length,2);assert.equal(c.wifiUseFallback,true);assert.equal(c.networkTicks,4);
});
test('RFID button reconnects the selected profile and retains its existing notification behavior',()=>{
 const c=rig();c.initWiFi();c.now=20000;c.updateWiFi();c.onButtonPressed();
 assert.equal(c.calls.at(-1).ssid,'hotspot');assert.equal(c.wifiUseFallback,true);assert.equal(c.beeps,1);assert.equal(c.notices,1);
});
test('RFID without fallback retains single-network retries',()=>{
 const c=rig({fallback:''});c.initWiFi();c.now=20000;c.updateWiFi();c.now=40000;c.updateWiFi();
 assert.deepEqual(c.calls.map(x=>x.ssid),['home','home','home']);assert.equal(c.wifiUseFallback,false);
});
test('RFID without configured Wi-Fi makes no connection attempts',()=>{
 const c=rig({configured:false});c.initWiFi();c.now=20000;c.updateWiFi();assert.equal(c.calls.length,0);
});
