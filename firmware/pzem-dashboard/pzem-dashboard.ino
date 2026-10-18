// ESP32-C3 + PZEM diagnostic-to-dashboard integration, isolated LAN only.
// Reads registers only. Never resets the energy counter or controls a relay.
#include <Arduino.h>
#include <WiFi.h>
#include <MQTT.h> // 256dpi MQTT, synchronous QoS1 publish/PUBACK
#include <Preferences.h>
#include <esp_system.h>
#include <esp_sntp.h>
#include <atomic>
#include <sys/time.h>
#include <time.h>
#include <stddef.h>
#include "pzem_frame.h"
#ifdef PZEM_USE_EXAMPLE_SECRETS
#include "secrets.example.h"
#else
#include "secrets.h"
#endif

constexpr int PZEM_RX_PIN=20,PZEM_TX_PIN=21;
constexpr uint32_t STATE_VERSION=1;
constexpr size_t QUEUE_SIZE=8,WIRE_SIZE=448;
struct QueueEntry { char wire[WIRE_SIZE]; };
struct PersistentState {
 uint32_t version,epoch,lastWh,hasCounter,head,count;
 uint64_t lastMeasuredUs;
 QueueEntry entries[QUEUE_SIZE];
 uint32_t checksum;
};
PersistentState state{};
Preferences preferences;
HardwareSerial pzemSerial(1);
WiFiClient network;
MQTTClient mqtt(1024);
std::atomic<bool> ntpSynced{false};
char bootId[37];String dataTopic,statusTopic;
uint32_t sequenceNo=0,lastSample=0,lastWifiAttempt=0,lastMqttAttempt=0,lastWaitNotice=0;
bool firstSample=true;

void halt(const char* reason){Serial.println(reason);while(true)delay(1000);}
uint32_t checksum(const PersistentState& value){
 uint32_t crc=0xffffffff;const uint8_t* p=reinterpret_cast<const uint8_t*>(&value);
 for(size_t i=0;i<offsetof(PersistentState,checksum);i++){crc^=p[i];for(int bit=0;bit<8;bit++)crc=(crc>>1)^((crc&1)?0xedb88320:0);}
 return ~crc;
}
void saveState(){state.checksum=checksum(state);if(preferences.putBytes("state",&state,sizeof(state))!=sizeof(state))halt("NVS gagal: pengiriman dihentikan; jangan hapus checkpoint.");}
void loadState(){
 if(!preferences.begin("pzem-dash-v1",false))halt("NVS belum tersedia.");
 const size_t size=preferences.getBytesLength("state");
 if(!size){state.version=STATE_VERSION;saveState();return;}
 if(size!=sizeof(state)||preferences.getBytes("state",&state,sizeof(state))!=sizeof(state)
  ||state.version!=STATE_VERSION||state.checksum!=checksum(state)||state.head>=QUEUE_SIZE||state.count>QUEUE_SIZE||state.epoch>2147483647)
  halt("Checkpoint tidak valid: dihentikan tanpa reset counter/antrean.");
 for(size_t i=0;i<state.count;i++)if(!memchr(state.entries[(state.head+i)%QUEUE_SIZE].wire,0,WIRE_SIZE))halt("Antrean tidak valid.");
}
void makeBootId(){uint8_t b[16];esp_fill_random(b,sizeof(b));b[6]=(b[6]&15)|0x40;b[8]=(b[8]&63)|0x80;
 snprintf(bootId,sizeof(bootId),"%02x%02x%02x%02x-%02x%02x-%02x%02x-%02x%02x-%02x%02x%02x%02x%02x%02x",b[0],b[1],b[2],b[3],b[4],b[5],b[6],b[7],b[8],b[9],b[10],b[11],b[12],b[13],b[14],b[15]);}
void timeReady(struct timeval*){ntpSynced.store(true);}
bool readPzem(PzemFrame& data){
 uint8_t request[8]={0xf8,4,0,0,0,10,0,0};const uint16_t crc=pzemCrc(request,6);request[6]=crc&255;request[7]=crc>>8;
 while(pzemSerial.available())pzemSerial.read();pzemSerial.write(request,sizeof(request));pzemSerial.flush();
 uint8_t reply[25];size_t used=0;const uint32_t start=millis();
 while(millis()-start<1200&&used<sizeof(reply)){while(pzemSerial.available()&&used<sizeof(reply))reply[used++]=pzemSerial.read();delay(1);}
 if(used!=sizeof(reply)){Serial.printf("Respons PZEM: %u/25 byte; periksa daya sensor dan sambungan UART.\n",unsigned(used));return false;}
 if(!decodePzem(reply,used,data)){Serial.println("Respons PZEM diterima, tetapi alamat/frame/CRC atau faktor daya tidak valid.");return false;}
 return true;
}
void sample(){
 if(!ntpSynced.load()){if(millis()-lastWaitNotice>10000){lastWaitNotice=millis();Serial.println("Menunggu NTP; belum mengirim waktu pengukuran.");}return;}
 PzemFrame data;if(!readPzem(data)){Serial.println("PZEM gagal dibaca/CRC tidak valid; tidak membuat pembacaan pengganti.");return;}
 timeval tv;gettimeofday(&tv,nullptr);if(tv.tv_sec<1704067200)return;
 const uint64_t measuredUs=uint64_t(tv.tv_sec)*1000000+tv.tv_usec;
 if(measuredUs<=state.lastMeasuredUs){Serial.println("Waktu belum maju; sampel ditahan.");return;}
 if(state.hasCounter&&data.energyWh<state.lastWh){if(state.epoch==2147483647)halt("Counter epoch mencapai batas.");state.epoch++;Serial.println("Counter sensor turun; counter_epoch dinaikkan.");}
 state.lastWh=data.energyWh;state.hasCounter=1;state.lastMeasuredUs=measuredUs;
 if(sequenceNo==UINT32_MAX)halt("Batas sequence; perlu reboot terkendali.");
 const uint32_t seq=sequenceNo++;
 if(state.count==QUEUE_SIZE){saveState();Serial.println("Antrean offline penuh: sampel baru hilang, tidak diganti angka buatan.");return;}
 tm utc;gmtime_r(&tv.tv_sec,&utc);char date[25],measuredAt[32],energy[28];
 strftime(date,sizeof(date),"%Y-%m-%dT%H:%M:%S",&utc);snprintf(measuredAt,sizeof(measuredAt),"%s.%03ldZ",date,long(tv.tv_usec/1000));
 snprintf(energy,sizeof(energy),"%lu.%03lu",(unsigned long)(data.energyWh/1000),(unsigned long)(data.energyWh%1000));
 QueueEntry& entry=state.entries[(state.head+state.count)%QUEUE_SIZE];
 const int length=snprintf(entry.wire,sizeof(entry.wire),"{\"schema_version\":1,\"boot_id\":\"%s\",\"sequence_no\":%lu,\"channel_no\":1,\"counter_epoch\":%lu,\"measured_at\":\"%s\",\"energy_kwh\":\"%s\",\"voltage_v\":%.1f,\"current_a\":%.3f,\"power_w\":%.1f,\"frequency_hz\":%.1f,\"power_factor\":%.2f}",bootId,(unsigned long)seq,(unsigned long)state.epoch,measuredAt,energy,data.voltage10/10.0,data.current1000/1000.0,data.power10/10.0,data.frequency10/10.0,data.pf100/100.0);
 if(length<0||size_t(length)>=sizeof(entry.wire))halt("Payload melebihi buffer.");
 state.count++;saveState();
 Serial.printf("PZEM: %.1f V | %.3f A | %.1f W | %s kWh | antrean %lu\n",data.voltage10/10.0,data.current1000/1000.0,data.power10/10.0,energy,(unsigned long)state.count);
}
void setup(){
 Serial.begin(115200);delay(2000);Serial.println("PZEM -> dashboard Kamar 1, schema v1 / QoS1 / LAN test");
 loadState();makeBootId();pzemSerial.begin(9600,SERIAL_8N1,PZEM_RX_PIN,PZEM_TX_PIN);
 WiFi.mode(WIFI_STA);String mac=WiFi.macAddress();mac.replace(":","");mac.toLowerCase();
 if(mac!=EXPECTED_MAC_HEX)halt("MAC ESP32 berbeda dari registrasi; jangan kirim atas identitas perangkat lain.");
 WiFi.setAutoReconnect(true);WiFi.begin(WIFI_SSID,WIFI_PASSWORD);
 esp_sntp_set_time_sync_notification_cb(timeReady);configTime(0,0,"pool.ntp.org","time.google.com");
 dataTopic=String("smartbilling/v1/devices/")+DEVICE_UID+"/readings";statusTopic=String("smartbilling/v1/devices/")+DEVICE_UID+"/status";
 mqtt.begin(MQTT_HOST,MQTT_PORT,network);mqtt.setOptions(30,true,3000);
 mqtt.setWill(statusTopic.c_str(),"{\"connected\":false}",true,1);
}
void loop(){
 const uint32_t now=millis();
 if(WiFi.status()!=WL_CONNECTED){if(now-lastWifiAttempt>=30000){lastWifiAttempt=now;WiFi.reconnect();}}
 else if(!mqtt.connected()&&(lastMqttAttempt==0||now-lastMqttAttempt>=5000)){
  lastMqttAttempt=now;
  if(mqtt.connect(DEVICE_UID,MQTT_USERNAME,MQTT_PASSWORD)){Serial.println("MQTT terhubung ke broker dashboard.");mqtt.publish(statusTopic,"{\"connected\":true}",true,1);}
  else Serial.printf("MQTT gagal: %d\n",int(mqtt.returnCode()));
 }
 if(mqtt.connected())mqtt.loop();
 if((firstSample||now-lastSample>=SAMPLE_INTERVAL_MS)&&ntpSynced.load()){firstSample=false;lastSample=now;sample();}
 else if(!ntpSynced.load()&&now-lastWaitNotice>=10000){lastWaitNotice=now;Serial.println("Menunggu sinkronisasi NTP.");}
 if(mqtt.connected()&&state.count){
  const QueueEntry& entry=state.entries[state.head];
  if(mqtt.publish(dataTopic.c_str(),entry.wire,false,1)){
   state.head=(state.head+1)%QUEUE_SIZE;state.count--;saveState();Serial.println("Sampel diakui broker (PUBACK); verifikasi dashboard untuk bukti tersimpan.");
  }else{Serial.println("Publish belum diakui; payload yang sama akan dicoba lagi.");mqtt.disconnect();}
 }
 delay(10);
}
