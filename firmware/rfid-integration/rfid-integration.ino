// Integration variant of team IOT.ino. Original wiring and bongo frames preserved.
// NEVER flash or attach an energized relay without separate hardware approval.
#include <Arduino.h>
#include <SPI.h>
#include <Wire.h>
#include <WiFi.h>
#include <MQTT.h>               // 256dpi MQTT, not PubSubClient (publish QoS 1)
#include <ArduinoJson.h>        // ArduinoJson 7
#include <atomic>
#include <Preferences.h>
#include <MFRC522.h>
#include <Adafruit_SSD1306.h>
#include <esp_sntp.h>
#include <esp_system.h>
#include <mbedtls/sha256.h>
#include <time.h>
#include <sys/time.h>
#include "bongo.h"
#include "presence_gate.h"
#include "reply_policy.h"
#ifdef RFID_USE_EXAMPLE_SECRETS
#include "secrets.example.h"    // Compile-only placeholders, not an operational setup
#else
#include "secrets.h"
#endif

// Team wiring: ESP32-C3; board/power/voltage still need physical verification.
#define RFID_SCK_PIN 4
#define RFID_MISO_PIN 5
#define RFID_MOSI_PIN 6
#define RFID_CS_PIN 7
#define RFID_RST_PIN 10
#define RELAY_PIN 3
#define OLED_SDA_PIN 0
#define OLED_SCL_PIN 1
#define OLED_WIDTH 128
#define OLED_HEIGHT 64
#define OLED_ADDR 0x3C
// Default doesn't drive GPIO3 at all. Disconnect relay physically for initial test.
#ifndef RFID_ENABLE_RELAY
#define RFID_ENABLE_RELAY 0
#endif
#if RFID_ENABLE_RELAY
#error "Relay control is not approved/implemented. Confirm safety and product policy first."
#endif

Adafruit_SSD1306 display(OLED_WIDTH,OLED_HEIGHT,&Wire,-1);
MFRC522 reader(RFID_CS_PIN,RFID_RST_PIN);
WiFiClient network;             // Authenticated isolated LAN only, NOT Internet/TLS
MQTTClient mqtt(2048);
Preferences preferences;
bool oledReady=false,sessionIsOpen=false,halted=false;
std::atomic<bool> ntpSynced{false};
std::atomic<uint32_t> ntpSyncMillis{0};
uint32_t lastConnect=0,lastPublish=0,lastScan=0,lastDisplay=0;
uint8_t checkingFrame=0;
PresenceGate presence;
String bootId,tapTopic,responseTopic,queuedResponse;
JsonDocument checkpoint;        // One NVS value: head + pending wire JSON + digest
String pendingWire,pendingDigest;

// No MQTT subscribe/publish from callback (library acknowledgment deadlock).
void onResponse(String &topic,String &message) {
 if(topic==responseTopic && message.length()<=2048)queuedResponse=message;
}
void onTimeSync(struct timeval *) {ntpSyncMillis=millis();ntpSynced=true;}
bool clockReady(){return ntpSynced&&millis()-ntpSyncMillis<21600000UL&&time(nullptr)>=1767225600;}
String uuidV4() {
 uint8_t bytes[16];esp_fill_random(bytes,sizeof(bytes));bytes[6]=(bytes[6]&0x0f)|0x40;bytes[8]=(bytes[8]&0x3f)|0x80;
 char result[37];snprintf(result,sizeof(result),"%02x%02x%02x%02x-%02x%02x-%02x%02x-%02x%02x-%02x%02x%02x%02x%02x%02x",
  bytes[0],bytes[1],bytes[2],bytes[3],bytes[4],bytes[5],bytes[6],bytes[7],bytes[8],bytes[9],bytes[10],bytes[11],bytes[12],bytes[13],bytes[14],bytes[15]);
 return String(result);
}
String digest(const String &wire) {
 uint8_t hash[32];if(mbedtls_sha256((const unsigned char*)wire.c_str(),wire.length(),hash,0)!=0)return "";
 char result[65];for(int i=0;i<32;i++)snprintf(result+i*2,3,"%02x",hash[i]);return String(result);
}
void oledShow(const String &line1,uint8_t size1,const String &line2,uint8_t size2);
void oledIdle(uint8_t frame=0);
void oledInit() {
    Wire.begin(OLED_SDA_PIN, OLED_SCL_PIN);
    oledReady = display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR);
}

void oledShow(const String &line1, uint8_t size1, const String &line2, uint8_t size2) {
    if (!oledReady) return;
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(0, (OLED_HEIGHT - (size1 + size2) * 8) / 2);
    display.setTextSize(size1);
    display.println(line1);
    display.setTextSize(size2);
    display.println(line2);
    display.display();
}

void oledCat(const unsigned char *frame, const char *caption, int16_t captionX) {
    if (!oledReady) return;
    display.clearDisplay();
    display.drawBitmap(0, 0, frame, BONGO_WIDTH, BONGO_HEIGHT, SSD1306_WHITE);
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(2);
    display.setCursor(captionX, 44);
    display.print(caption);
    display.display();
}

void oledIdle(uint8_t frame) {
    if (sessionIsOpen) {
        oledCat(bongoIdle[frame % BONGO_IDLE_FRAMES], "Last OPEN", 4);
    } else {
        oledCat(bongoIdle[frame % BONGO_IDLE_FRAMES], "Please tap", 4);
    }
}

void oledIdleAnimate() {
    static uint32_t lastFrame = 0;
    static uint8_t frame = 0;
    if (millis() - lastFrame < 220) return;
    lastFrame = millis();
    frame = (frame + 1) % BONGO_IDLE_FRAMES;
    oledIdle(frame);
}


void failSafe(const char *reason) {
 halted=true;presence.error();oledShow("Review",2,reason,1);
 // Deliberately no payload/card UID/credentials in serial output.
}
bool saveCheckpoint() {
 String wire;serializeJson(checkpoint,wire);
 if(preferences.putString("state",wire)!=wire.length()){failSafe("NVS write failed");return false;}
 return true;
}
bool loadCheckpoint() {
 if(!preferences.begin("sb-rfid-v1",false)){failSafe("NVS unavailable");return false;}
 String saved=preferences.getString("state","");
 if(saved.isEmpty()) {
  // First commissioning only. Never erase NVS to repair a stream with history.
  checkpoint["version"]=1;checkpoint["device_uid"]=DEVICE_UID;checkpoint["channel"]=READER_CHANNEL;
  checkpoint["head"]=nullptr;checkpoint["pending"]=nullptr;checkpoint["pending_sha256"]=nullptr;
  return saveCheckpoint();
 }
 if(deserializeJson(checkpoint,saved)||checkpoint["version"]!=1||
   checkpoint["device_uid"].as<String>()!=DEVICE_UID||checkpoint["channel"].as<int>()!=READER_CHANNEL){
  failSafe("NVS/config mismatch");return false;
 }
 JsonVariant head=checkpoint["head"];
 if(!head.isNull()&&(!head["boot_id"].is<String>()||head["boot_id"].as<String>().length()!=36||
  !head["sequence_no"].is<uint64_t>()||head["sequence_no"].as<uint64_t>()>9007199254740991ULL)){
  failSafe("Head corrupt");return false;
 }
 pendingWire=checkpoint["pending"].isNull()?"":checkpoint["pending"].as<String>();
 pendingDigest=checkpoint["pending_sha256"].isNull()?"":checkpoint["pending_sha256"].as<String>();
 if(!checkpoint["pending"].isNull()) {
  JsonDocument event;
  if(pendingWire.isEmpty()||deserializeJson(event,pendingWire)||digest(pendingWire)!=pendingDigest||
    !event["boot_id"].is<String>()||!event["sequence_no"].is<uint64_t>()||
    event["schema_version"]!=1||event["reader_channel"].as<int>()!=READER_CHANNEL||
    !event["card_uid"].is<String>()||!event["occurred_at"].is<String>()){
   failSafe("Pending corrupt");return false;
  }
  JsonVariant previous=event["previous_event"];
  if(previous.isNull()!=head.isNull()||(!head.isNull()&&
    (previous["boot_id"].as<String>()!=head["boot_id"].as<String>()||
     previous["sequence_no"].as<uint64_t>()!=head["sequence_no"].as<uint64_t>()))){failSafe("Pending chain corrupt");return false;}
 }
 // Always require an observed card removal after reboot, even with no pending event.
 presence.error();return true;
}
void captureTap(const String &uid) {
 if(halted||!pendingWire.isEmpty()||!mqtt.connected()||!clockReady())return;
 JsonDocument event;event["schema_version"]=1;event["boot_id"]=bootId;
 JsonVariant head=checkpoint["head"];
 const uint64_t seq=head.isNull()||head["boot_id"].as<String>()!=bootId?0:head["sequence_no"].as<uint64_t>()+1;
 if(seq>9007199254740991ULL){failSafe("Sequence exhausted");return;}
 event["sequence_no"]=seq;
 if(head.isNull())event["previous_event"]=nullptr;else event["previous_event"].set(head);
 event["reader_channel"]=READER_CHANNEL;event["card_uid"]=uid;
 struct timeval now;gettimeofday(&now,nullptr);struct tm utc;gmtime_r(&now.tv_sec,&utc);
 char timestamp[32];strftime(timestamp,sizeof(timestamp),"%Y-%m-%dT%H:%M:%S",&utc);
 String measured=String(timestamp);char fraction[8];snprintf(fraction,sizeof(fraction),".%03ldZ",now.tv_usec/1000);
 event["occurred_at"]=measured+fraction;
 String wire;serializeJson(event,wire);String hash=digest(wire);
 if(hash.isEmpty()){failSafe("Hash failed");return;}
 checkpoint["pending"]=wire;checkpoint["pending_sha256"]=hash;
 if(!saveCheckpoint())return; // Durable BEFORE publishing; failures must never emit.
 pendingWire=wire;pendingDigest=hash;lastPublish=millis()-5000;
}
void handleResponse() {
 if(queuedResponse.isEmpty())return;
 JsonDocument response;String incoming=queuedResponse;queuedResponse="";
 if(deserializeJson(response,incoming)||pendingWire.isEmpty())return;
 JsonDocument event;if(deserializeJson(event,pendingWire)){failSafe("Pending invalid");return;}
 if(response["schema_version"]!=1||response["device_uid"].as<String>()!=DEVICE_UID||
  response["boot_id"].as<String>()!=event["boot_id"].as<String>()||
  !response["sequence_no"].is<uint64_t>()||
  response["sequence_no"].as<uint64_t>()!=event["sequence_no"].as<uint64_t>()||
  response["request_sha256"].as<String>()!=pendingDigest)return;
 String status=response["status"].as<String>(),action=response["action"].as<String>();
 const auto decision=replyDecision(true,status.c_str(),response["consumed"]==true,action.c_str());
 if(decision==ReplyDecision::Ignore)return; // PUBACK / pending do NOT advance the head.
 if(decision==ReplyDecision::Commit) {
  checkpoint["head"]["boot_id"]=event["boot_id"];
  checkpoint["head"]["sequence_no"]=event["sequence_no"];
  checkpoint["pending"]=nullptr;checkpoint["pending_sha256"]=nullptr;
  if(!saveCheckpoint())return; // Atomic head+clear: power loss replays old pending safely.
  pendingWire="";pendingDigest="";
  if(status=="processed") {sessionIsOpen=action=="opened";oledShow(sessionIsOpen?"Sesi dibuka":"Sesi ditutup",1,"Relay nonaktif",1);}
  else oledShow("Ditolak",2,response["reason"].as<String>(),1);
  lastDisplay=millis();
 }else {
  // Conflict/review/unconsumed rejection: KEEP NVS pending, halt, require investigation.
  failSafe("Periksa backend");
 }
}
void setup() {
 oledInit(); // No relay pinMode/digitalWrite here.
 tapTopic=String("smartbilling/v1/devices/")+DEVICE_UID+"/rfid/taps";
 responseTopic=String("smartbilling/v1/devices/")+DEVICE_UID+"/rfid/responses";
 bootId=uuidV4();if(!loadCheckpoint())return;
 SPI.begin(RFID_SCK_PIN,RFID_MISO_PIN,RFID_MOSI_PIN,RFID_CS_PIN);reader.PCD_Init();
 byte version=reader.PCD_ReadRegister(MFRC522::VersionReg);
 if(version==0||version==0xff){failSafe("RFID wiring");return;}
 WiFi.mode(WIFI_STA);WiFi.begin(WIFI_SSID,WIFI_PASSWORD);
 esp_sntp_set_time_sync_notification_cb(onTimeSync);configTime(0,0,NTP_SERVER);
 mqtt.begin(MQTT_HOST,MQTT_PORT,network);mqtt.onMessage(onResponse);
 mqtt.setOptions(30,true,2000); // clean session: NVS application retry is authoritative.
 oledShow("Siap uji",2,"Lepaskan kartu",1);
}
void loop() {
 if(halted){delay(20);return;}
 if(WiFi.status()!=WL_CONNECTED) {
  if(millis()-lastConnect>=5000){lastConnect=millis();WiFi.reconnect();}
 }else if(!mqtt.connected()&&millis()-lastConnect>=5000) {
  lastConnect=millis();String clientId=String("sb-rfid-")+DEVICE_UID;
  if(mqtt.connect(clientId.c_str(),MQTT_USERNAME,MQTT_PASSWORD)){
   if(!mqtt.subscribe(responseTopic,1))mqtt.disconnect();
  }
 }
 mqtt.loop();handleResponse();if(halted)return;
 if(mqtt.connected()&&!pendingWire.isEmpty()&&millis()-lastPublish>=5000) {
  lastPublish=millis();
  mqtt.publish(tapTopic,pendingWire,false,1); // QoS1, retain=false. NEVER clear on PUBACK.
  handleResponse(); // Library may receive response while waiting for publish PUBACK.
 }
 if(millis()-lastScan>=100) {
  lastScan=millis();byte atqa[2],len=2;
  byte readerVersion=reader.PCD_ReadRegister(MFRC522::VersionReg);
  if(readerVersion==0||readerVersion==0xff){failSafe("RFID disconnected");return;}
  auto probe=reader.PICC_WakeupA(atqa,&len); // Detect even previously halted card.
  if(probe==MFRC522::STATUS_TIMEOUT) {
   presence.timeout();
  }else if(probe==MFRC522::STATUS_OK) {
   if(reader.PICC_ReadCardSerial()){
    if(presence.present()) {
     // Includes offline/pending/NTP: remove and rescan when ready.
     String uid;for(byte i=0;i<reader.uid.size;i++){char hex[3];snprintf(hex,sizeof(hex),"%02X",reader.uid.uidByte[i]);uid+=hex;}
     captureTap(uid);
    }
    reader.PICC_HaltA();reader.PCD_StopCrypto1();
   }else presence.error();
  }else {
   // Collision / communication error is NOT confirmed removal. Never re-arm here.
   presence.error();
  }
 }
 if(millis()-lastDisplay>=2500) {
  if(!pendingWire.isEmpty()) {
   if(millis()-lastDisplay>=150){oledCat(bongoTap[checkingFrame++%BONGO_TAP_FRAMES],"Checking",16);lastDisplay=millis()-2350;}
  }else if(!clockReady())oledShow("Tunggu NTP",1,"Belum merekam tap",1);
  else if(!mqtt.connected())oledShow("Offline",2,"Tap baru diblokir",1);
  else oledIdleAnimate();
 }
 delay(5);
}
