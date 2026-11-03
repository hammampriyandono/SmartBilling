// Dashboard commissioning variant of rfid_serial_local.ino.
// Manual RC522 SPI driver retained; no relay, buzzer, OLED, button or PZEM GPIO control.
#include <Arduino.h>
#include <SPI.h>
#include <WiFi.h>
#include <WiFiMulti.h>
#include <MQTT.h>
#include <ArduinoJson.h>
#include <atomic>
#include <Preferences.h>
#include <esp_sntp.h>
#include <esp_system.h>
#include <mbedtls/sha256.h>
#include <sys/time.h>
#include "presence_gate.h"
#include "reply_policy.h"
#ifdef RFID_USE_EXAMPLE_SECRETS
#include "secrets.example.h"
#else
#include "secrets.h"
#endif
const int PIN_SPI_SCK=4,PIN_SPI_MISO=5,PIN_SPI_MOSI=6,PIN_RFID_SS=7,PIN_RFID_RST=10;
constexpr uint32_t RFID_SPI_CLOCK_HZ=1000000;
uint8_t lastRFIDError=0,lastRFIDIrq=0;
bool rfidReady=false,halted=false,sessionIsOpen=false;
uint32_t lastConnect=0,lastPublish=0,lastScan=0,lastDisplay=0,lastStatus=0,lastInit=0;
uint32_t lastNtpAttempt=0;
bool ntpStarted=false;
String bootId,tapTopic,responseTopic,statusTopic,queuedResponse,pendingWire,pendingDigest;
JsonDocument checkpoint;
WiFiClient network;
WiFiMulti wifi;
MQTTClient mqtt(2048);
Preferences preferences;
PresenceGate presence;
std::atomic<bool> ntpSynced{false};
std::atomic<uint32_t> ntpSyncMillis{0};
void onTimeSync(struct timeval *){ntpSyncMillis=millis();ntpSynced=true;}
bool clockReady(){return ntpSynced&&millis()-ntpSyncMillis<21600000UL&&time(nullptr)>=1767225600;}
void onResponse(String &topic,String &message){if(topic==responseTopic&&message.length()<=2048)queuedResponse=message;}
void oledShow(const String &a,uint8_t,const String &b,uint8_t){Serial.printf("[RFID] %s | %s\n",a.c_str(),b.c_str());}
void failSafe(const char *reason){halted=true;presence.error();Serial.printf("[RFID] Dihentikan: %s\n",reason);lastStatus=millis()-15000;}
String uuidV4(){
 uint8_t b[16];esp_fill_random(b,sizeof(b));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;
 char out[37];snprintf(out,sizeof(out),"%02x%02x%02x%02x-%02x%02x-%02x%02x-%02x%02x-%02x%02x%02x%02x%02x%02x",b[0],b[1],b[2],b[3],b[4],b[5],b[6],b[7],b[8],b[9],b[10],b[11],b[12],b[13],b[14],b[15]);return String(out);
}
String digest(const String &wire){uint8_t hash[32];if(mbedtls_sha256((const unsigned char*)wire.c_str(),wire.length(),hash,0)!=0)return "";char out[65];for(int i=0;i<32;i++)snprintf(out+2*i,3,"%02x",hash[i]);return String(out);}
String statusWire(bool connected){
 JsonDocument p;p["schema_version"]=1;p["boot_id"]=bootId;p["connected"]=connected;
 p["reader_state"]=!connected?"unknown":halted?"error":rfidReady?"ready":"unavailable";
 p["ntp_synced"]=clockReady();p["pending_tap"]=!pendingWire.isEmpty();p["uptime_ms"]=millis();
 String out;serializeJson(p,out);return out;
}

// ---------------- Register dan perintah RC522 ----------------
constexpr uint8_t REG_COMMAND = 0x01;
constexpr uint8_t REG_COMIRQ = 0x04;
constexpr uint8_t REG_DIVIRQ = 0x05;
constexpr uint8_t REG_ERROR = 0x06;
constexpr uint8_t REG_FIFO_DATA = 0x09;
constexpr uint8_t REG_FIFO_LEVEL = 0x0A;
constexpr uint8_t REG_CONTROL = 0x0C;
constexpr uint8_t REG_BIT_FRAMING = 0x0D;
constexpr uint8_t REG_COLL = 0x0E;
constexpr uint8_t REG_MODE = 0x11;
constexpr uint8_t REG_TX_MODE = 0x12;
constexpr uint8_t REG_RX_MODE = 0x13;
constexpr uint8_t REG_TX_CONTROL = 0x14;
constexpr uint8_t REG_TX_ASK = 0x15;
constexpr uint8_t REG_CRC_H = 0x21;
constexpr uint8_t REG_CRC_L = 0x22;
constexpr uint8_t REG_MOD_WIDTH = 0x24;
constexpr uint8_t REG_TMODE = 0x2A;
constexpr uint8_t REG_TPRESCALER = 0x2B;
constexpr uint8_t REG_TRELOAD_H = 0x2C;
constexpr uint8_t REG_TRELOAD_L = 0x2D;
constexpr uint8_t REG_VERSION = 0x37;
constexpr uint8_t CMD_IDLE = 0x00;
constexpr uint8_t CMD_CALC_CRC = 0x03;
constexpr uint8_t CMD_TRANSCEIVE = 0x0C;
constexpr uint8_t PICC_WUPA = 0x52;


uint8_t readRegister(uint8_t reg) {
    SPI.beginTransaction(SPISettings(RFID_SPI_CLOCK_HZ, MSBFIRST, SPI_MODE0));
    digitalWrite(PIN_RFID_SS, LOW);
    SPI.transfer(((reg << 1) & 0x7E) | 0x80);
    uint8_t value = SPI.transfer(0x00);
    digitalWrite(PIN_RFID_SS, HIGH);
    SPI.endTransaction();
    return value;
}

void writeRegister(uint8_t reg, uint8_t value) {
    SPI.beginTransaction(SPISettings(RFID_SPI_CLOCK_HZ, MSBFIRST, SPI_MODE0));
    digitalWrite(PIN_RFID_SS, LOW);
    SPI.transfer((reg << 1) & 0x7E);
    SPI.transfer(value);
    digitalWrite(PIN_RFID_SS, HIGH);
    SPI.endTransaction();
}

bool initRFID() {
    pinMode(PIN_RFID_SS, OUTPUT);
    pinMode(PIN_RFID_RST, OUTPUT);
    digitalWrite(PIN_RFID_SS, HIGH);
    SPI.begin(PIN_SPI_SCK, PIN_SPI_MISO, PIN_SPI_MOSI, PIN_RFID_SS);

    bool ready = false;
    for (uint8_t attempt = 1; attempt <= 3; attempt++) {
        digitalWrite(PIN_RFID_RST, LOW);
        delay(5);
        digitalWrite(PIN_RFID_RST, HIGH);
        delay(100);
        uint8_t v1 = readRegister(REG_VERSION);
        delay(5);
        uint8_t v2 = readRegister(REG_VERSION);
        delay(5);
        uint8_t v3 = readRegister(REG_VERSION);
        Serial.printf("[RFID] Percobaan %u/3 | version=0x%02X/0x%02X/0x%02X\n",
                      attempt, v1, v2, v3);
        if (v1 == 0x00 || v1 == 0xFF || v1 != v2 || v2 != v3) continue;

        writeRegister(REG_MODE, 0x3D);
        uint8_t modeA = readRegister(REG_MODE);
        writeRegister(REG_MODE, 0x3F);
        uint8_t modeB = readRegister(REG_MODE);
        if (modeA == 0x3D && modeB == 0x3F) {
            ready = true;
            break;
        }
        Serial.println("[RFID] Uji tulis-baca register gagal.");
    }
    if (!ready) return false;

    writeRegister(REG_TX_MODE, 0x00);
    writeRegister(REG_RX_MODE, 0x00);
    writeRegister(REG_MOD_WIDTH, 0x26);
    // Timer komunikasi kartu: sekitar 25 ms.
    writeRegister(REG_TMODE, 0x80);
    writeRegister(REG_TPRESCALER, 0xA9);
    writeRegister(REG_TRELOAD_H, 0x03);
    writeRegister(REG_TRELOAD_L, 0xE8);
    writeRegister(REG_TX_ASK, 0x40);
    writeRegister(REG_MODE, 0x3D); // Preset CRC_A = 0x6363.
    writeRegister(REG_TX_CONTROL, readRegister(REG_TX_CONTROL) | 0x03);
    delay(10);
    Serial.println("[RFID] Register SPI siap; antena diaktifkan.");
    return true;
}

bool calculateCRC(const uint8_t *data, uint8_t length, uint8_t *crc) {
    writeRegister(REG_COMMAND, CMD_IDLE);
    writeRegister(REG_DIVIRQ, 0x04);
    writeRegister(REG_FIFO_LEVEL, 0x80);
    for (uint8_t i = 0; i < length; i++) writeRegister(REG_FIFO_DATA, data[i]);
    writeRegister(REG_COMMAND, CMD_CALC_CRC);

    uint32_t started = millis();
    while (!(readRegister(REG_DIVIRQ) & 0x04)) {
        if (millis() - started >= 30) {
            writeRegister(REG_COMMAND, CMD_IDLE);
            return false;
        }
        delay(1);
    }
    writeRegister(REG_COMMAND, CMD_IDLE);
    crc[0] = readRegister(REG_CRC_L);
    crc[1] = readRegister(REG_CRC_H);
    return true;
}

bool transceive(const uint8_t *tx, uint8_t txLength, uint8_t txLastBits,
                uint8_t *rx, uint8_t capacity,
                uint8_t &rxLength, uint8_t &rxLastBits) {
    rxLength = 0;
    rxLastBits = 0;
    writeRegister(REG_COMMAND, CMD_IDLE);
    writeRegister(REG_COMIRQ, 0x7F);
    writeRegister(REG_FIFO_LEVEL, 0x80);
    for (uint8_t i = 0; i < txLength; i++) writeRegister(REG_FIFO_DATA, tx[i]);
    writeRegister(REG_BIT_FRAMING, txLastBits & 0x07);
    writeRegister(REG_COMMAND, CMD_TRANSCEIVE);
    writeRegister(REG_BIT_FRAMING, (txLastBits & 0x07) | 0x80);

    uint32_t started = millis();
    do {
        lastRFIDIrq = readRegister(REG_COMIRQ);
        if (lastRFIDIrq & 0x33) break; // RX, Idle, timer, atau error.
        delay(1);
    } while (millis() - started < 40);

    writeRegister(REG_BIT_FRAMING, txLastBits & 0x07);
    writeRegister(REG_COMMAND, CMD_IDLE);
    lastRFIDError = readRegister(REG_ERROR);
    if (!(lastRFIDIrq & 0x30) || (lastRFIDError & 0x1B)) return false;

    uint8_t received = readRegister(REG_FIFO_LEVEL);
    if (received == 0 || received > capacity) return false;
    rxLastBits = readRegister(REG_CONTROL) & 0x07;
    for (uint8_t i = 0; i < received; i++) rx[i] = readRegister(REG_FIFO_DATA);
    rxLength = received;
    return true;
}

void haltCard() {
    uint8_t command[4] = {0x50, 0x00, 0x00, 0x00};
    if (!calculateCRC(command, 2, &command[2])) return;
    uint8_t ignored[4];
    uint8_t length = 0;
    uint8_t lastBits = 0;
    // Kartu yang menerima HALT memang tidak membalas.
    transceive(command, sizeof(command), 0, ignored, sizeof(ignored), length, lastBits);
}

bool readCardUID(uint8_t *uid, uint8_t &uidLength, bool &cardResponded) {
    uidLength = 0;
    cardResponded = false;
    uint8_t rx[16];
    uint8_t length = 0;
    uint8_t lastBits = 0;
    uint8_t wakeup = PICC_WUPA;
    writeRegister(REG_COLL, readRegister(REG_COLL) & 0x7F);
    if (!transceive(&wakeup, 1, 7, rx, sizeof(rx), length, lastBits)) {
        cardResponded = lastRFIDError != 0 || !(lastRFIDIrq & 0x01); // Only a clean RF timer timeout is removal.
        return false;
    }
    cardResponded = true;
    if (length != 2 || lastBits != 0) return false;

    // Cascade level mendukung UID 4, 7, dan 10 byte, satu kartu setiap kali.
    const uint8_t cascadeCommands[] = {0x93, 0x95, 0x97};
    for (uint8_t level = 0; level < 3; level++) {
        uint8_t command[9] = {cascadeCommands[level], 0x20};
        if (!transceive(command, 2, 0, rx, sizeof(rx), length, lastBits) ||
            length != 5 || lastBits != 0) return false;
        if ((rx[0] ^ rx[1] ^ rx[2] ^ rx[3]) != rx[4]) return false;

        bool hasCascadeTag = rx[0] == 0x88;
        uint8_t first = hasCascadeTag ? 1 : 0;
        for (uint8_t i = first; i < 4; i++) {
            if (uidLength >= 10) return false;
            uid[uidLength++] = rx[i];
        }

        command[1] = 0x70;
        for (uint8_t i = 0; i < 5; i++) command[i + 2] = rx[i];
        if (!calculateCRC(command, 7, &command[7])) return false;
        if (!transceive(command, sizeof(command), 0, rx, sizeof(rx), length, lastBits) ||
            length != 3 || lastBits != 0) return false;
        uint8_t crc[2];
        if (!calculateCRC(rx, 1, crc) || rx[1] != crc[0] || rx[2] != crc[1]) return false;

        bool moreLevels = (rx[0] & 0x04) != 0;
        if (!moreLevels) {
            if (hasCascadeTag || (uidLength != 4 && uidLength != 7 && uidLength != 10)) {
                return false;
            }
            haltCard();
            return true;
        }
        if (!hasCascadeTag || level == 2) return false;
    }
    return false;
}

String uidToString(const uint8_t *uid, uint8_t length) {
    String result;
    result.reserve(length * 2);
    for (uint8_t i = 0; i < length; i++) {
        char hexByte[3];
        snprintf(hexByte, sizeof(hexByte), "%02X", uid[i]);
        result += hexByte;
    }
    return result;
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


void setup(){
 Serial.begin(115200);delay(1200);
 Serial.println("[BOOT] RFID dashboard: relay/OLED/PZEM tidak dikendalikan.");
 bootId=uuidV4();
 tapTopic=String("smartbilling/v1/devices/")+DEVICE_UID+"/rfid/taps";
 responseTopic=String("smartbilling/v1/devices/")+DEVICE_UID+"/rfid/responses";
 statusTopic=String("smartbilling/v1/devices/")+DEVICE_UID+"/rfid/status";
 loadCheckpoint(); // A checkpoint error blocks taps, but connection diagnostics stay available.
 wifi.addAP(WIFI_SSID,WIFI_PASSWORD);
 if(String(WIFI_SECONDARY_SSID).length())wifi.addAP(WIFI_SECONDARY_SSID,WIFI_SECONDARY_PASSWORD);
 WiFi.mode(WIFI_STA);
 esp_sntp_set_time_sync_notification_cb(onTimeSync);
 mqtt.begin(MQTT_HOST,MQTT_PORT,network);mqtt.onMessage(onResponse);mqtt.setOptions(30,true,2000);
 if(!halted){rfidReady=initRFID();lastInit=millis();}
 Serial.println(rfidReady?"[RFID] Reader terdeteksi; angkat kartu sebelum tap.":"[RFID] Reader belum siap; koneksi dashboard tetap berjalan.");
 lastConnect=millis()-5000;lastStatus=millis()-15000;
}
void loop(){
 if(millis()-lastConnect>=5000){
  lastConnect=millis();
  if(WiFi.status()!=WL_CONNECTED)wifi.run(1000);
  if(WiFi.status()==WL_CONNECTED&&!mqtt.connected()){
   const char *host=WiFi.SSID()==WIFI_SECONDARY_SSID?MQTT_SECONDARY_HOST:MQTT_HOST;
   mqtt.setHost(host,MQTT_PORT);
   String will=statusWire(false);mqtt.setWill(statusTopic.c_str(),will.c_str(),true,1);
   String clientId=String("sb-rfid-")+DEVICE_UID;
   if(mqtt.connect(clientId.c_str(),MQTT_USERNAME,MQTT_PASSWORD)){
    if(!mqtt.subscribe(responseTopic,1))mqtt.disconnect();
    else{Serial.println("[MQTT] Terhubung ke dashboard.");lastStatus=millis()-15000;}
   }else Serial.println("[MQTT] Belum terhubung; periksa jaringan/broker.");
  }
 }
 if(WiFi.status()==WL_CONNECTED&&!clockReady()&&(!ntpStarted||millis()-lastNtpAttempt>=60000)){
  ntpStarted=true;lastNtpAttempt=millis();
  configTime(0,0,NTP_SERVER,"time.google.com","time.cloudflare.com");
  Serial.println("[NTP] Meminta sinkronisasi waktu setelah Wi-Fi tersambung.");
 }
 mqtt.loop();handleResponse();
 if(!halted&&!rfidReady&&millis()-lastInit>=10000){lastInit=millis();rfidReady=initRFID();presence.error();lastStatus=millis()-15000;}
 if(mqtt.connected()&&!pendingWire.isEmpty()&&!halted&&millis()-lastPublish>=5000){lastPublish=millis();mqtt.publish(tapTopic,pendingWire,false,1);handleResponse();}
 if(rfidReady&&!halted&&millis()-lastScan>=100){
  lastScan=millis();uint8_t v=readRegister(REG_VERSION);
  if(v==0||v==0xff){rfidReady=false;presence.error();lastStatus=millis()-15000;}
  else{
   uint8_t uidBytes[10],length=0;bool responded=false;
   if(readCardUID(uidBytes,length,responded)){
    if(presence.present()){
     captureTap(uidToString(uidBytes,length));lastStatus=millis()-15000;
    }
   }else if(responded)presence.error();else presence.timeout();
  }
 }
 if(mqtt.connected()&&millis()-lastStatus>=15000){lastStatus=millis();mqtt.publish(statusTopic,statusWire(true),false,1);}
 delay(5);
}
