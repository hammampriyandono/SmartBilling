#include <Arduino.h>
#include <SPI.h>
#include <Wire.h>
#include <WiFi.h>
#include <Preferences.h>
#include <Adafruit_SSD1306.h>
#include "bongo.h"
#include "dashboard_link.h"

// =====================================================================
//  Node RFID Mesin Cuci + PZEM-004T  (Capstone A-05)  -  v4
//  Dasar: rfid_serial_local v3 (RFID, relay, buzzer, OLED sudah terbukti jalan).
//  Tambahan v4:
//   1. PZEM-004T v3 dibaca lewat UART1 (GPIO20/21), Modbus RTU tanpa library.
//   2. Hanya kartu TERDAFTAR yang boleh membuka sesi. Daftar disimpan di flash
//      (tetap ada walau listrik mati) dan dikelola lewat Serial Monitor.
//   3. Tombol GPIO9 = sambung ulang WiFi. WiFi juga dicoba ulang otomatis.
//   4. Energi per sesi mesin cuci dihitung dari PZEM (E_akhir - E_awal).
//  RFID dan relay tetap bekerja walau WiFi mati (validasi kartu lokal).
// =====================================================================

// WiFi diambil dari secrets.h (WIFI_SSID, WIFI_PASSWORD, opsional MQTT_SERVER, MQTT_PORT).
// Tanpa secrets.h, sketch tetap bisa di-compile dan berjalan tanpa WiFi.
#if __has_include("secrets.h")
#include "secrets.h"
#endif
#ifndef WIFI_SSID
#define WIFI_SSID ""
#endif
#ifndef WIFI_PASSWORD
#define WIFI_PASSWORD ""
#endif

// MQTT opsional. 0 = mati (data hanya tampil di Serial Monitor).
// Isi 1 bila backend/dashboard sudah siap menerima topik di bawah (butuh library PubSubClient).
#ifndef ENABLE_MQTT
#define ENABLE_MQTT 0
#endif
#if ENABLE_MQTT
#include <PubSubClient.h>
#ifndef MQTT_SERVER
#define MQTT_SERVER "192.168.1.10"
#endif
#ifndef MQTT_PORT
#define MQTT_PORT 1883
#endif
#define DEVICE_ID      "mesincuci01"
#define TOPIC_BASE     "kost/komunal/" DEVICE_ID
#define TOPIC_PZEM     TOPIC_BASE "/pzem"      // telemetri periodik
#define TOPIC_SESSION  TOPIC_BASE "/session"   // ringkasan sesi selesai
#define TOPIC_EVENT    TOPIC_BASE "/event"     // kartu ditolak, dll.
#define TOPIC_STATUS   TOPIC_BASE "/status"    // online/offline (retained)
#endif

// Sesi RFID lokal, buzzer, dan animasi Bongo OLED.
#if defined(CONFIG_IDF_TARGET_ESP32C3) && !ARDUINO_USB_CDC_ON_BOOT
#error "Aktifkan Tools > USB CDC On Boot > Enabled untuk Serial Monitor USB."
#endif

// ---------------- Peta GPIO (sesuai PCB) ----------------
const int PIN_OLED_SDA = 0;
const int PIN_OLED_SCL = 1;
const int PIN_BUZZER   = 2;   // Aktif LOW, Q2 PNP, pull-up R8.
const int PIN_RELAY    = 3;   // Aktif HIGH, Q1 NPN, pull-down R2.
const int PIN_SPI_SCK  = 4;
const int PIN_SPI_MISO = 5;
const int PIN_SPI_MOSI = 6;
const int PIN_RFID_SS  = 7;
const int PIN_LED_MOD  = 8;   // Aktif LOW.
const int PIN_BUTTON   = 9;   // Aktif LOW: tekan = sambung ulang WiFi.
const int PIN_RFID_RST = 10;
// PZEM memakai GPIO20 dan GPIO21. Arah RX/TX dicari otomatis: kalau PZEM tidak
// menjawab, kode menukar RX<->TX sendiri, lalu menyimpan arah yang berhasil di flash.
const int PZEM_PIN_A   = 20;
const int PZEM_PIN_B   = 21;

// false = driver Q1 NPN aktif HIGH sesuai peta GPIO.
constexpr bool RELAY_ACTIVE_LOW = false;
constexpr uint8_t RELAY_ON_LEVEL = RELAY_ACTIVE_LOW ? LOW : HIGH;
constexpr uint8_t RELAY_OFF_LEVEL = RELAY_ACTIVE_LOW ? HIGH : LOW;

// Hanya kartu terdaftar boleh membuka sesi; penutupan hanya oleh UID pemilik.
// false: tap hanya membaca UID.
constexpr bool TEST_RELAY_WITH_TAP = true;
// Perintah relay manual dimatikan agar sesi tidak bisa dilewati dari Serial.
constexpr bool ENABLE_MANUAL_RELAY_TEST = false;
constexpr uint32_t RFID_SPI_CLOCK_HZ = 1000000;
constexpr uint32_t CARD_REMOVAL_MS = 600;
constexpr uint32_t RELAY_OFF_DELAY_MS = 5000;
constexpr uint32_t BUZZER_BEEP_MS = 150;
constexpr uint32_t BUZZER_DENY_MS = 700;   // bunyi panjang = kartu ditolak
constexpr uint8_t OLED_ADDR = 0x3C;
constexpr int OLED_WIDTH = 128;
constexpr int OLED_HEIGHT = 64;

// HANYA kartu di daftar ini yang boleh memakai mesin cuci. Kartu lain selalu ditolak.
// Tulis UID HEX huruf besar tanpa spasi (sama seperti yang tercetak di Serial Monitor).
const char *const DEFAULT_UIDS[] = {
    "91EAA066",   // kartu 1
    "2A9E2AF2",   // kartu 2
};
// false = daftar kartu dikunci ke DEFAULT_UIDS di atas; perintah E/X di Serial dimatikan
//         dan daftar lama di flash dihapus saat boot.
// true  = kartu tambahan boleh didaftarkan lewat Serial (perintah E), disimpan di flash.
constexpr bool ALLOW_SERIAL_ENROLL = false;
constexpr uint8_t MAX_CARDS = 30;

// PZEM-004T v3: 9600 8N1, alamat umum 0xF8 (berlaku untuk satu PZEM di jalur UART).
constexpr uint8_t PZEM_ADDR = 0xF8;
constexpr uint32_t PZEM_POLL_MS = 1000;
constexpr uint32_t PZEM_POLL_TEST_MS = 200;   // mode uji LED (perintah U)
constexpr uint32_t PZEM_TEST_DURATION_MS = 15000;
constexpr uint8_t PZEM_FAILS_BEFORE_SWAP = 4;  // gagal beruntun sebelum RX/TX ditukar
constexpr uint32_t PZEM_TIMEOUT_MS = 250;

constexpr uint32_t WIFI_RETRY_MS = 20000;   // coba ulang otomatis bila WiFi putus
constexpr uint32_t BUTTON_DEBOUNCE_MS = 50;
#if ENABLE_MQTT
constexpr uint32_t MQTT_RETRY_MS = 5000;
constexpr uint32_t TELEMETRY_MS = 5000;
#endif

Adafruit_SSD1306 display(OLED_WIDTH, OLED_HEIGHT, &Wire, -1);
bool oledReady = false;
bool oledDirty = true;
uint32_t oledLastFrame = 0;
uint8_t oledFrame = 0;
String oledNoticeTitle;
String oledNoticeSubtitle;
uint32_t oledNoticeStarted = 0;
uint32_t oledNoticeDuration = 0;
bool oledNoticeTapAnimation = false;
bool buzzerIsOn = false;
uint32_t buzzerStarted = 0;
uint32_t buzzerDuration = BUZZER_BEEP_MS;

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

bool relayIsOn = false;
bool manualRelayMode = false;
bool rfidReady = false;
bool relayOffPending = false;
uint32_t relayOffStarted = 0;
uint8_t lastCountdown = 0;
String activeUserUID;
bool cardLatched = false;
String lastCardUID;
bool absenceTracking = false;
uint32_t absenceStarted = 0;
uint8_t lastRFIDError = 0;
uint8_t lastRFIDIrq = 0;

// ---------------- Daftar kartu terdaftar (flash/NVS) ----------------
Preferences prefs;
String registeredList = ",";   // format ",UID1,UID2," agar pencarian tepat satu UID
enum class CardMode : uint8_t { NORMAL, ENROLL, REMOVE };
CardMode cardMode = CardMode::NORMAL;
uint32_t cardModeStarted = 0;
constexpr uint32_t CARD_MODE_TIMEOUT_MS = 30000;

// ---------------- PZEM-004T ----------------
HardwareSerial PzemSerial(1);
struct PzemReading {
    float voltage = 0, current = 0, power = 0, frequency = 0, pf = 0;
    uint32_t energyWh = 0;
    bool valid = false;        // pembacaan terakhir berhasil
    uint32_t readAt = 0;
};
PzemReading pzem;
bool pzemWaiting = false;
uint32_t pzemLastPoll = 0;
uint32_t pzemSentAt = 0;
uint8_t pzemBuf[25];
uint8_t pzemLen = 0;
uint32_t pzemFailCount = 0;
uint8_t pzemSwap = 0;            // 0: RX=GPIO20 TX=GPIO21 | 1: RX=GPIO21 TX=GPIO20
bool pzemEverOK = false;
bool pzemDebug = false;          // perintah D: cetak byte mentah TX/RX
uint32_t pzemTestUntil = 0;      // perintah U: kirim cepat agar LED PZEM berkedip
int pzemRxPin() { return pzemSwap ? PZEM_PIN_B : PZEM_PIN_A; }
int pzemTxPin() { return pzemSwap ? PZEM_PIN_A : PZEM_PIN_B; }
uint32_t pzemOkCount = 0;

// Energi sesi mesin cuci
bool sessionHasStartEnergy = false;
uint32_t sessionStartWh = 0;
uint32_t sessionStartMs = 0;

// ---------------- WiFi & tombol ----------------
const bool wifiConfigured = sizeof(WIFI_SSID) > 1;
uint32_t wifiLastTry = 0;
bool wifiWasConnected = false;
bool buttonLastRaw = HIGH;
uint32_t buttonChangedAt = 0;
bool buttonHandled = true;

#if ENABLE_MQTT
WiFiClient netClient;
PubSubClient mqtt(netClient);
uint32_t mqttLastTry = 0;
uint32_t telemetryLast = 0;
#endif

void startBeep(uint32_t duration) {
    // Q2 PNP aktif LOW. Open-drain melepas pin saat OFF, R8 menariknya HIGH.
    pinMode(PIN_BUZZER, OUTPUT_OPEN_DRAIN);
    digitalWrite(PIN_BUZZER, LOW);
    buzzerStarted = millis();
    buzzerDuration = duration;
    buzzerIsOn = true;
}

void startSuccessBeep() {
    startBeep(BUZZER_BEEP_MS);
    Serial.println("[BUZZER] Beep tap diterima.");
}

void startDenyBeep() {
    startBeep(BUZZER_DENY_MS);
    Serial.println("[BUZZER] Beep panjang: kartu ditolak.");
}

void updateBuzzer() {
    if (buzzerIsOn && millis() - buzzerStarted >= buzzerDuration) {
        digitalWrite(PIN_BUZZER, HIGH);
        buzzerIsOn = false;
    }
}

void showOledNotice(const String &title, const String &subtitle,
                    uint32_t duration, bool tapAnimation) {
    oledNoticeTitle = title;
    oledNoticeSubtitle = subtitle;
    oledNoticeStarted = millis();
    oledNoticeDuration = duration;
    oledNoticeTapAnimation = tapAnimation;
    oledFrame = 0;
    oledDirty = true;
}

void initOLED() {
    if (!Wire.begin(PIN_OLED_SDA, PIN_OLED_SCL)) {
        Serial.println("[OLED] Gagal memulai I2C; RFID dan relay tetap berjalan.");
        return;
    }
    Wire.setClock(400000);
    Wire.setTimeOut(20);
    Wire.beginTransmission(OLED_ADDR);
    if (Wire.endTransmission() != 0) {
        Serial.printf("[OLED] Tidak ada jawaban di 0x%02X | SDA=%d SCL=%d\n",
                      OLED_ADDR, PIN_OLED_SDA, PIN_OLED_SCL);
        return;
    }
    oledReady = display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR, true, false);
    if (!oledReady) {
        Serial.println("[OLED] Gagal membuat buffer tampilan.");
        return;
    }
    display.setTextColor(SSD1306_WHITE);
    display.setTextWrap(false);
    showOledNotice("STARTING", "RFID+Relay+PZEM", 10000, false);
    Serial.printf("[OLED] Siap | SDA=%d SCL=%d alamat=0x%02X\n",
                  PIN_OLED_SDA, PIN_OLED_SCL, OLED_ADDR);
}

void drawCenteredText(const String &text, int16_t y, uint8_t size) {
    int16_t width = static_cast<int16_t>(text.length()) * 6 * size;
    int16_t x = width < OLED_WIDTH ? (OLED_WIDTH - width) / 2 : 0;
    display.setTextSize(size);
    display.setCursor(x, y);
    display.print(text);
}

String powerText() {
    if (!pzem.valid) return "PZEM?";
    return String(pzem.power, 1) + "W";
}

void updateOLED() {
    if (!oledReady) return;
    uint32_t now = millis();
    bool noticeActive = oledNoticeDuration && now - oledNoticeStarted < oledNoticeDuration;
    bool tapAnimation = relayOffPending || (noticeActive && oledNoticeTapAnimation);
    uint32_t interval = tapAnimation ? 150 : 220;
    if (!oledDirty && now - oledLastFrame < interval) return;
    oledLastFrame = now;
    oledDirty = false;

    String title;
    String subtitle;
    if (relayOffPending) {
        // Countdown selalu terlihat, termasuk jika kartu lain mencoba tap.
        uint32_t elapsed = now - relayOffStarted;
        uint32_t seconds = elapsed >= RELAY_OFF_DELAY_MS
                           ? 0 : (RELAY_OFF_DELAY_MS - elapsed + 999) / 1000;
        title = "OFF IN " + String(seconds);
        subtitle = activeUserUID;
    } else if (noticeActive) {
        title = oledNoticeTitle;
        subtitle = oledNoticeSubtitle;
    } else if (!rfidReady) {
        title = "RFID ERROR";
        subtitle = "Check wiring";
    } else if (cardMode == CardMode::ENROLL) {
        title = "DAFTAR";
        subtitle = "Tap kartu baru";
    } else if (cardMode == CardMode::REMOVE) {
        title = "HAPUS";
        subtitle = "Tap kartu dihapus";
    } else if (manualRelayMode) {
        title = "MANUAL";
        subtitle = relayIsOn ? "Relay ON" : "Relay OFF";
    } else if (relayIsOn) {
        title = "IN USE";
        subtitle = activeUserUID + " " + powerText();
    } else {
        title = "PLEASE TAP";
        String net = !wifiConfigured ? "No WiFi cfg"
                   : (WiFi.status() == WL_CONNECTED ? "WiFi OK" : "WiFi OFF");
        subtitle = net + " | " + powerText();
    }

    // Uji ACK lebih dahulu agar OLED terlepas tidak terus menunda kontrol relay.
    Wire.beginTransmission(OLED_ADDR);
    if (Wire.endTransmission() != 0) {
        oledReady = false;
        Serial.println("[OLED] Koneksi terputus; RFID dan relay tetap berjalan.");
        return;
    }
    const unsigned char *bitmap = tapAnimation
        ? bongoTap[oledFrame % BONGO_TAP_FRAMES]
        : bongoIdle[oledFrame % BONGO_IDLE_FRAMES];
    oledFrame = (oledFrame + 1) % (tapAnimation ? BONGO_TAP_FRAMES : BONGO_IDLE_FRAMES);
    display.clearDisplay();
    display.drawBitmap(0, 0, bitmap, BONGO_WIDTH, BONGO_HEIGHT, SSD1306_WHITE);
    drawCenteredText(title, 36, 2);
    drawCenteredText(subtitle, 56, 1);
    display.display();
}

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
        updateBuzzer();
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
        updateBuzzer();
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
        cardResponded = (lastRFIDError & 0x08) != 0; // Ada tabrakan jawaban kartu.
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

// =====================================================================
//  Daftar kartu terdaftar (disimpan di flash, tetap ada setelah reset)
// =====================================================================
bool isDefaultCard(const String &uid) {
    for (const char *d : DEFAULT_UIDS) if (uid.equalsIgnoreCase(d)) return true;
    return false;
}

bool isRegistered(const String &uid) {
    if (isDefaultCard(uid)) return true;
    return ALLOW_SERIAL_ENROLL && registeredList.indexOf("," + uid + ",") >= 0;
}

uint8_t registeredCount() {
    uint8_t n = 0;
    for (size_t i = 1; i < registeredList.length(); i++) if (registeredList[i] == ',') n++;
    return n;
}

void saveRegistered() {
    prefs.putString("uids", registeredList);
}

void loadRegistered() {
    prefs.begin("rfid", false);
    registeredList = prefs.getString("uids", ",");
    if (!registeredList.startsWith(",")) registeredList = ",";
    if (!ALLOW_SERIAL_ENROLL && registeredList != ",") {
        // Daftar dikunci: kartu yang pernah didaftarkan lewat Serial tidak berlaku lagi.
        registeredList = ",";
        saveRegistered();
        Serial.println("[KARTU] Daftar lama di flash dihapus (daftar dikunci di kode).");
    }
    Serial.printf("[KARTU] %u kartu terdaftar di flash + %u kartu bawaan.\n",
                  registeredCount(), (unsigned)(sizeof(DEFAULT_UIDS) / sizeof(DEFAULT_UIDS[0])));
}

void listRegistered() {
    Serial.println("[KARTU] Daftar kartu terdaftar:");
    for (const char *d : DEFAULT_UIDS) Serial.printf("  - %s (bawaan di kode)\n", d);
    int start = 1;
    while (start < (int)registeredList.length()) {
        int end = registeredList.indexOf(',', start);
        if (end < 0) break;
        Serial.printf("  - %s\n", registeredList.substring(start, end).c_str());
        start = end + 1;
    }
    if (registeredCount() == 0 && sizeof(DEFAULT_UIDS) == 0)
        Serial.println("  (kosong) Ketik E lalu tap kartu untuk mendaftarkan.");
}

bool addCard(const String &uid) {
    if (isRegistered(uid)) return false;
    if (registeredCount() >= MAX_CARDS) {
        Serial.printf("[KARTU] Penuh (%u kartu). Hapus kartu lama dengan X.\n", MAX_CARDS);
        return false;
    }
    registeredList += uid + ",";
    saveRegistered();
    return true;
}

bool removeCard(const String &uid) {
    if (registeredList.indexOf("," + uid + ",") < 0) return false;
    registeredList.replace("," + uid + ",", ",");
    saveRegistered();
    return true;
}

void setCardMode(CardMode mode) {
    if (!ALLOW_SERIAL_ENROLL && mode != CardMode::NORMAL) {
        Serial.println("[KARTU] Daftar kartu dikunci di kode (DEFAULT_UIDS). Perintah E/X dimatikan.");
        return;
    }
    cardMode = mode;
    cardModeStarted = millis();
    oledDirty = true;
    if (mode == CardMode::ENROLL)
        Serial.println("[KARTU] MODE DAFTAR: tap kartu baru dalam 30 detik (ketik N untuk batal).");
    else if (mode == CardMode::REMOVE)
        Serial.println("[KARTU] MODE HAPUS: tap kartu yang akan dihapus dalam 30 detik (N = batal).");
    else
        Serial.println("[KARTU] Kembali ke mode normal.");
}

// =====================================================================
//  PZEM-004T v3 (Modbus RTU, fungsi 0x04, register 0..9), non-blocking
// =====================================================================
uint16_t modbusCRC(const uint8_t *data, uint8_t length) {
    uint16_t crc = 0xFFFF;
    for (uint8_t i = 0; i < length; i++) {
        crc ^= data[i];
        for (uint8_t b = 0; b < 8; b++) crc = (crc & 1) ? (crc >> 1) ^ 0xA001 : crc >> 1;
    }
    return crc;
}

void pzemBeginUART() {
    PzemSerial.end();
    pinMode(PZEM_PIN_A, INPUT);
    pinMode(PZEM_PIN_B, INPUT);
    PzemSerial.begin(9600, SERIAL_8N1, pzemRxPin(), pzemTxPin());
    Serial.printf("[PZEM] UART1 9600 8N1 | RX ESP=GPIO%d <- TX PZEM | TX ESP=GPIO%d -> RX PZEM | alamat 0x%02X\n",
                  pzemRxPin(), pzemTxPin(), PZEM_ADDR);
}

void pzemSwapPins(const char *why) {
    pzemSwap ^= 1;
    pzemFailCount = 0;
    pzemWaiting = false;
    Serial.printf("[PZEM] Tukar arah RX/TX (%s).\n", why);
    pzemBeginUART();
}

void initPZEM() {
    pzemSwap = prefs.getUChar("pzswap", 0) ? 1 : 0;   // arah terakhir yang berhasil
    pzemBeginUART();
}

void pzemSendRequest() {
    while (PzemSerial.available()) PzemSerial.read();   // buang sisa data lama
    uint8_t frame[8] = {PZEM_ADDR, 0x04, 0x00, 0x00, 0x00, 0x0A, 0, 0};
    uint16_t crc = modbusCRC(frame, 6);
    frame[6] = crc & 0xFF;
    frame[7] = crc >> 8;
    PzemSerial.write(frame, sizeof(frame));
    if (pzemDebug) Serial.printf("[PZEM-TX] GPIO%d: F8 04 00 00 00 0A %02X %02X\n", pzemTxPin(), frame[6], frame[7]);
    pzemLen = 0;
    pzemSentAt = millis();
    pzemWaiting = true;
}

void pzemPrintHint() {
    Serial.println("[PZEM] Tidak ada jawaban yang valid. Periksa berurutan:");
    Serial.println("  1) Sisi AC PZEM HARUS tersambung 220 V (L-N). Tanpa 220 V chip PZEM tidak menyala,");
    Serial.println("     walau LED/5 V dari ESP32 ada. CT boleh tanpa beban.");
    Serial.println("  2) Kabel data: TX/RX PZEM ke GPIO20/GPIO21. Arah ditukar otomatis; dua arah sudah dicoba.");
    Serial.println("     Ketik U: LED RX di PZEM harus berkedip. Tidak berkedip = kabel/VCC PZEM bermasalah.");
    Serial.println("  3) GND PZEM tersambung ke GND ESP32.");
    Serial.println("  4) Pin 5V PZEM diberi 5 V (optocoupler & LED RX/TX PZEM butuh daya ini).");
    Serial.println("     Disarankan resistor seri 1 k pada jalur TX PZEM -> ESP (GPIO ESP32-C3 tidak tahan 5 V).");
    Serial.println("  5) Satu PZEM saja di jalur UART ini (alamat umum 0xF8).");
}

void pzemFail(const char *reason) {
    DashboardLink::sensorFailed();
    pzemWaiting = false;
    pzemFailCount++;
    if (pzemDebug) {
        Serial.printf("[PZEM-RX] GPIO%d: %u byte (%s)", pzemRxPin(), pzemLen, reason);
        for (uint8_t i = 0; i < pzemLen; i++) Serial.printf(" %02X", pzemBuf[i]);
        Serial.println();
    }
    // Belum pernah berhasil: coba arah RX/TX sebaliknya secara otomatis.
    if (!pzemEverOK && pzemFailCount >= PZEM_FAILS_BEFORE_SWAP) {
        static uint8_t rounds = 0;
        if (pzemSwap == 1 && rounds++ % 5 == 0) {   // kedua arah sudah dicoba
            Serial.println("[PZEM] Kedua arah RX/TX sudah dicoba, PZEM tetap tidak menjawab.");
            pzemPrintHint();
        }
        pzemSwapPins("tidak ada jawaban");
        return;
    }
    if (pzem.valid && pzemFailCount >= 3) {
        pzem.valid = false;
        oledDirty = true;
    }
    if (pzemEverOK && (pzemFailCount == 3 || pzemFailCount % 30 == 0)) {
        Serial.printf("[PZEM] Gagal %lu kali berturut-turut (%s, %u byte diterima).\n",
                      (unsigned long)pzemFailCount, reason, pzemLen);
        pzemPrintHint();
    }
}

void pzemParse() {
    pzemWaiting = false;
    uint16_t crc = modbusCRC(pzemBuf, 23);
    if (pzemBuf[0] != PZEM_ADDR || pzemBuf[1] != 0x04 || pzemBuf[2] != 20 ||
        pzemBuf[23] != (crc & 0xFF) || pzemBuf[24] != (crc >> 8)) {
        pzemFail("CRC/format salah");
        return;
    }
    uint16_t r[10];
    for (uint8_t i = 0; i < 10; i++) r[i] = (pzemBuf[3 + 2 * i] << 8) | pzemBuf[4 + 2 * i];
    pzem.voltage   = r[0] / 10.0f;
    pzem.current   = ((uint32_t)r[1] | ((uint32_t)r[2] << 16)) / 1000.0f;
    pzem.power     = ((uint32_t)r[3] | ((uint32_t)r[4] << 16)) / 10.0f;
    pzem.energyWh  = (uint32_t)r[5] | ((uint32_t)r[6] << 16);
    pzem.frequency = r[7] / 10.0f;
    pzem.pf        = r[8] / 100.0f;
    pzem.readAt = millis();
    DashboardLink::sensorReading(pzem.voltage, pzem.current, pzem.power, pzem.energyWh, pzem.frequency, pzem.pf);
    if (!pzem.valid || pzemFailCount) {
        Serial.println("[PZEM] Terbaca dengan baik.");
        oledDirty = true;
    }
    pzem.valid = true;
    pzemFailCount = 0;
    if (!pzemEverOK) {
        pzemEverOK = true;
        if (prefs.getUChar("pzswap", 255) != pzemSwap) prefs.putUChar("pzswap", pzemSwap);
        Serial.printf("[PZEM] Arah benar: RX ESP=GPIO%d, TX ESP=GPIO%d (disimpan).\n", pzemRxPin(), pzemTxPin());
    }
    pzemOkCount++;
}

void printPZEM() {
    if (!pzem.valid) {
        Serial.println("[PZEM] Belum ada pembacaan valid.");
        return;
    }
    float s = pzem.voltage * pzem.current;
    Serial.printf("[PZEM] V=%.1f V | I=%.3f A | P=%.1f W | E=%lu Wh | f=%.1f Hz | PF=%.2f | S=V*I=%.1f VA | P/S=%.2f\n",
                  pzem.voltage, pzem.current, pzem.power, (unsigned long)pzem.energyWh,
                  pzem.frequency, pzem.pf, s, s > 0 ? pzem.power / s : 0.0f);
}

void updatePZEM() {
    uint32_t now = millis();
    if (!pzemWaiting) {
        uint32_t interval = (int32_t)(pzemTestUntil - now) > 0 ? PZEM_POLL_TEST_MS : PZEM_POLL_MS;
        if (now - pzemLastPoll >= interval) {
            pzemLastPoll = now;
            pzemSendRequest();
        }
        return;
    }
    while (PzemSerial.available() && pzemLen < sizeof(pzemBuf)) {
        pzemBuf[pzemLen++] = PzemSerial.read();
        // Jawaban error Modbus (fungsi 0x84) hanya 5 byte.
        if (pzemLen == 5 && pzemBuf[1] == 0x84) {
            Serial.printf("[PZEM] Jawaban error Modbus kode 0x%02X.\n", pzemBuf[2]);
            pzemFail("error Modbus");
            return;
        }
    }
    if (pzemLen >= sizeof(pzemBuf)) {
        pzemParse();
        static uint32_t lastLog = 0;
        if (pzem.valid && now - lastLog >= 10000) {   // ringkasan tiap 10 detik
            lastLog = now;
            printPZEM();
        }
    } else if (now - pzemSentAt >= PZEM_TIMEOUT_MS) {
        pzemFail(pzemLen ? "jawaban terpotong" : "tidak ada jawaban");
    }
}

// =====================================================================
//  WiFi, tombol, MQTT (opsional)
// =====================================================================
void wifiConnect(const char *reason) {
    if (!wifiConfigured) {
        Serial.println("[WIFI] WIFI_SSID kosong. Isi secrets.h untuk memakai WiFi.");
        return;
    }
    Serial.printf("[WIFI] Menyambung ke \"%s\" (%s)...\n", WIFI_SSID, reason);
    WiFi.disconnect(false, false);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    wifiLastTry = millis();
}

void initWiFi() {
    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(true);
    WiFi.setSleep(false);
    wifiConnect("awal");
}

void onButtonPressed() {
    Serial.println("[TOMBOL] Ditekan: sambung ulang WiFi.");
    startSuccessBeep();
    showOledNotice("WIFI", "Reconnecting...", 2000, false);
    wifiConnect("tombol");
#if ENABLE_MQTT
    mqtt.disconnect();
    mqttLastTry = 0;
#endif
}

void updateButton() {
    bool raw = digitalRead(PIN_BUTTON);
    uint32_t now = millis();
    if (raw != buttonLastRaw) {
        buttonLastRaw = raw;
        buttonChangedAt = now;
        if (raw == HIGH) buttonHandled = false;   // dilepas: siap untuk tekan berikutnya
    }
    if (raw == LOW && !buttonHandled && now - buttonChangedAt >= BUTTON_DEBOUNCE_MS) {
        buttonHandled = true;
        onButtonPressed();
    }
}

#if ENABLE_MQTT
void mqttPublish(const char *topic, const char *payload, bool retained = false) {
    if (!mqtt.connected()) return;
    bool ok = mqtt.publish(topic, payload, retained);
    Serial.printf("[MQTT] %s %s %s\n", ok ? "TX" : "GAGAL", topic, payload);
}

void updateMQTT() {
    if (WiFi.status() != WL_CONNECTED) return;
    uint32_t now = millis();
    if (!mqtt.connected()) {
        if (now - mqttLastTry < MQTT_RETRY_MS) return;
        mqttLastTry = now;
        String id = String(DEVICE_ID "-") + String((uint32_t)ESP.getEfuseMac(), HEX);
        Serial.printf("[MQTT] Menyambung ke %s:%d ...\n", MQTT_SERVER, MQTT_PORT);
        if (mqtt.connect(id.c_str(), nullptr, nullptr, TOPIC_STATUS, 1, true, "offline")) {
            mqtt.publish(TOPIC_STATUS, "online", true);
            Serial.println("[MQTT] Tersambung.");
        } else {
            Serial.printf("[MQTT] Gagal, kode %d\n", mqtt.state());
        }
        return;
    }
    mqtt.loop();
    if (pzem.valid && now - telemetryLast >= TELEMETRY_MS) {
        telemetryLast = now;
        char buf[200];
        snprintf(buf, sizeof(buf),
                 "{\"v\":%.1f,\"i\":%.3f,\"p\":%.1f,\"e_wh\":%lu,\"f\":%.1f,\"pf\":%.2f,\"relay\":%d,\"uid\":\"%s\"}",
                 pzem.voltage, pzem.current, pzem.power, (unsigned long)pzem.energyWh,
                 pzem.frequency, pzem.pf, relayIsOn ? 1 : 0, activeUserUID.c_str());
        mqttPublish(TOPIC_PZEM, buf);
    }
}
#endif

void updateWiFi() {
    if (!wifiConfigured) return;
    bool connected = WiFi.status() == WL_CONNECTED;
    if (connected != wifiWasConnected) {
        wifiWasConnected = connected;
        oledDirty = true;
        if (connected) Serial.printf("[WIFI] Tersambung | IP=%s | RSSI=%d dBm\n",
                                     WiFi.localIP().toString().c_str(), WiFi.RSSI());
        else Serial.println("[WIFI] Terputus. Coba ulang otomatis, atau tekan tombol.");
    }
    if (!connected && millis() - wifiLastTry >= WIFI_RETRY_MS) wifiConnect("otomatis");
#if ENABLE_MQTT
    updateMQTT();
#endif
}

// =====================================================================
//  Relay, Serial, sesi
// =====================================================================
// Satu fungsi untuk perubahan ON/OFF relay saat program berjalan.
void setRelay(bool on) {
    digitalWrite(PIN_RELAY, on ? RELAY_ON_LEVEL : RELAY_OFF_LEVEL);
    relayIsOn = on;
    if (!on) {
        activeUserUID = "";
        relayOffPending = false;
    }
    oledDirty = true;
    Serial.printf("[RELAY] %s | GPIO%d=%s | pemilik=%s\n",
                  on ? "ON" : "OFF", PIN_RELAY,
                  (on ? RELAY_ON_LEVEL : RELAY_OFF_LEVEL) == HIGH ? "HIGH" : "LOW",
                  activeUserUID.length() ? activeUserUID.c_str() : "-");
}

void printSerialHelp() {
    Serial.println("[SERIAL] Perintah (ketik satu huruf lalu Send):");
    if (ALLOW_SERIAL_ENROLL)
        Serial.println("  E = daftarkan kartu baru (tap setelahnya) | X = hapus kartu (tap setelahnya) | N = batal");
    Serial.println("  K = lihat daftar kartu | P = data PZEM terakhir | W = sambung ulang WiFi | ? = status");
    Serial.println("  U = uji LED PZEM 15 detik | T = tukar RX/TX PZEM manual | D = tampilkan byte mentah PZEM");
    if (!ENABLE_MANUAL_RELAY_TEST)
        Serial.println("  Kontrol relay manual dimatikan; sesi hanya ditutup UID pemilik.");
}

void printRelayStatus() {
    uint8_t requestedLevel = relayIsOn ? RELAY_ON_LEVEL : RELAY_OFF_LEVEL;
    Serial.printf("[STATUS] mode=%s | RFID=%s | relay_perintah=%s\n",
                  manualRelayMode ? "MANUAL" : "TAP RFID",
                  rfidReady ? "siap" : "belum siap", relayIsOn ? "ON" : "OFF");
    Serial.printf("[STATUS] GPIO%d diminta=%s terbaca=%s | aktif %s\n",
                  PIN_RELAY, requestedLevel == HIGH ? "HIGH" : "LOW",
                  digitalRead(PIN_RELAY) == HIGH ? "HIGH" : "LOW",
                  RELAY_ACTIVE_LOW ? "LOW" : "HIGH");
    Serial.printf("[STATUS] pemilik=%s | menunggu_OFF=%s | OLED=%s | kartu terdaftar=%u\n",
                  activeUserUID.length() ? activeUserUID.c_str() : "-",
                  relayOffPending ? "ya" : "tidak", oledReady ? "siap" : "tidak siap",
                  registeredCount() + (unsigned)(sizeof(DEFAULT_UIDS) / sizeof(DEFAULT_UIDS[0])));
    Serial.printf("[STATUS] WiFi=%s | PZEM=%s (ok %lu, gagal beruntun %lu)\n",
                  !wifiConfigured ? "belum diisi" : (WiFi.status() == WL_CONNECTED ? "tersambung" : "putus"),
                  pzem.valid ? "terbaca" : "belum terbaca",
                  (unsigned long)pzemOkCount, (unsigned long)pzemFailCount);
}

void setManualRelay(bool on) {
    if (!ENABLE_MANUAL_RELAY_TEST || (!manualRelayMode && activeUserUID.length())) {
        Serial.println("[AKSES] Kontrol manual ditolak; sesi RFID dilindungi.");
        return;
    }
    manualRelayMode = true;
    relayOffPending = false;
    activeUserUID = on ? "SERIAL" : "";
    Serial.println("[MODE] MANUAL. Tap RFID hanya mencetak UID dan tidak mengubah relay.");
    setRelay(on);
    printRelayStatus();
}

void pollSerialCommands() {
    // Perintah satu karakter, tanpa menunggu newline atau menggunakan timeout baca.
    for (uint8_t processed = 0; processed < 32 && Serial.available(); processed++) {
        int command = Serial.read();
        bool changesRelay = command == '1' || command == '0' ||
                            command == 'H' || command == 'h' ||
                            command == 'L' || command == 'l' ||
                            command == 'A' || command == 'a';
        if (changesRelay && (!ENABLE_MANUAL_RELAY_TEST ||
            (!manualRelayMode && activeUserUID.length()))) {
            Serial.println("[AKSES] Perintah manual ditolak. Hanya kartu pemilik boleh menutup sesi.");
            continue;
        }
        switch (command) {
            case '1': setManualRelay(true); break;
            case '0': setManualRelay(false); break;
            case 'H': case 'h':
                Serial.println("[TES] Meminta level fisik HIGH pada GPIO3.");
                setManualRelay(RELAY_ON_LEVEL == HIGH);
                break;
            case 'L': case 'l':
                Serial.println("[TES] Meminta level fisik LOW pada GPIO3.");
                setManualRelay(RELAY_ON_LEVEL == LOW);
                break;
            case 'A': case 'a':
                setRelay(false);
                manualRelayMode = false;
                Serial.println("[MODE] TAP RFID. Angkat kartu dahulu, lalu tap kembali.");
                printRelayStatus();
                break;
            case 'E': case 'e': setCardMode(CardMode::ENROLL); break;
            case 'X': case 'x': setCardMode(CardMode::REMOVE); break;
            case 'N': case 'n': setCardMode(CardMode::NORMAL); break;
            case 'K': case 'k': listRegistered(); break;
            case 'P': case 'p': printPZEM(); break;
            case 'W': case 'w': onButtonPressed(); break;
            case 'U': case 'u':
                pzemTestUntil = millis() + PZEM_TEST_DURATION_MS;
                Serial.printf("[PZEM] Uji LED: kirim perintah tiap 0,2 s selama 15 s lewat GPIO%d.\n", pzemTxPin());
                Serial.println("       LED RX di PZEM harus berkedip. Kalau PZEM menjawab, LED TX ikut berkedip.");
                break;
            case 'T': case 't':
                pzemEverOK = false;
                pzemSwapPins("perintah T");
                break;
            case 'D': case 'd':
                pzemDebug = !pzemDebug;
                Serial.printf("[PZEM] Tampilan byte mentah %s.\n", pzemDebug ? "AKTIF" : "mati");
                break;
            case '?':
                printRelayStatus();
                printSerialHelp();
                break;
            case '\r': case '\n': case ' ': case '\t':
                break;
            default:
                Serial.println("[SERIAL] Perintah tidak dikenal. Kirim ? untuk petunjuk.");
                break;
        }
    }
}

void denyCard(const String &uid, const char *why, const char *oledSub) {
    Serial.printf("[AKSES] DITOLAK | UID=%s | %s\n", uid.c_str(), why);
    startDenyBeep();
    showOledNotice("DENIED", oledSub, 1800, false);
#if ENABLE_MQTT
    char buf[120];
    snprintf(buf, sizeof(buf), "{\"event\":\"denied\",\"uid\":\"%s\",\"reason\":\"%s\"}", uid.c_str(), why);
    mqttPublish(TOPIC_EVENT, buf);
#endif
}

void handleCardMode(const String &uid) {
    if (cardMode == CardMode::ENROLL) {
        if (isRegistered(uid)) {
            Serial.printf("[KARTU] %s sudah terdaftar.\n", uid.c_str());
            showOledNotice("SUDAH ADA", uid, 1500, false);
        } else if (addCard(uid)) {
            Serial.printf("[KARTU] TERDAFTAR | UID=%s | total=%u\n", uid.c_str(), registeredCount());
            startSuccessBeep();
            showOledNotice("TERDAFTAR", uid, 1800, true);
        }
    } else {
        if (isDefaultCard(uid)) {
            Serial.printf("[KARTU] %s kartu bawaan di kode; hapus dari DEFAULT_UIDS.\n", uid.c_str());
        } else if (removeCard(uid)) {
            Serial.printf("[KARTU] DIHAPUS | UID=%s | sisa=%u\n", uid.c_str(), registeredCount());
            startSuccessBeep();
            showOledNotice("DIHAPUS", uid, 1800, false);
        } else {
            Serial.printf("[KARTU] %s memang tidak terdaftar.\n", uid.c_str());
            showOledNotice("TIDAK ADA", uid, 1500, false);
        }
    }
    setCardMode(CardMode::NORMAL);
}

void handleTap(const String &uid, uint8_t uidLength) {
    Serial.printf("[RFID] UID=%s | panjang=%u byte | %s\n", uid.c_str(), uidLength,
                  isRegistered(uid) ? "terdaftar" : "BELUM terdaftar");
    DashboardLink::tap(uid);
    if (cardMode != CardMode::NORMAL) {
        if (relayIsOn) {
            Serial.println("[KARTU] Selesaikan sesi mesin cuci dahulu sebelum daftar/hapus kartu.");
            setCardMode(CardMode::NORMAL);
        } else {
            handleCardMode(uid);
        }
    } else if (manualRelayMode) {
        Serial.println("[TES] Mode MANUAL: UID tercetak; relay tetap mengikuti perintah Serial.");
    } else if (!TEST_RELAY_WITH_TAP) {
        Serial.println("[TES] Tap hanya membaca UID. Tidak mengubah relay.");
    } else if (relayIsOn && uid != activeUserUID) {
        // Jangan mengubah pemilik, relay, atau timestamp countdown milik sesi.
        denyCard(uid, ("sesi sedang dipakai " + activeUserUID).c_str(), "In use by owner");
    } else if (relayOffPending) {
        Serial.println("[SESI] Pemilik sudah meminta OFF. Countdown diteruskan, tidak diulang.");
    } else if (!relayIsOn) {
        if (!isRegistered(uid)) {
            denyCard(uid, "kartu tidak terdaftar", "Not registered");
        } else {
            activeUserUID = uid;
            sessionStartMs = millis();
            sessionHasStartEnergy = pzem.valid;
            sessionStartWh = pzem.energyWh;
            Serial.printf("[SESI] DIMULAI | pemilik=%s | E_awal=%s\n", activeUserUID.c_str(),
                          pzem.valid ? (String(sessionStartWh) + " Wh").c_str() : "PZEM belum terbaca");
            setRelay(true);
            startSuccessBeep();
            showOledNotice("RELAY ON", activeUserUID, 1200, true);
        }
    } else if (uid == activeUserUID) {
        // Pemilik tetap disimpan sampai waktu 5 detik berakhir dan relay OFF.
        relayOffPending = true;
        relayOffStarted = millis();
        lastCountdown = 0;
        startSuccessBeep();
        oledFrame = 0;
        oledDirty = true;
        Serial.printf("[SESI] Pemilik=%s tap kembali. Relay tetap ON selama 5 detik.\n",
                      activeUserUID.c_str());
    }
    Serial.println("[INFO] Angkat kartu sebelum tap berikutnya.");
}

void finishSession(uint32_t waitMs) {
    uint32_t durationS = (millis() - sessionStartMs) / 1000;
    bool energyOK = sessionHasStartEnergy && pzem.valid && pzem.energyWh >= sessionStartWh;
    uint32_t usedWh = energyOK ? pzem.energyWh - sessionStartWh : 0;
    Serial.printf("[SESI] SELESAI | pemilik=%s | durasi=%lu s | energi=%s | waktu tunggu=%lu ms\n",
                  activeUserUID.c_str(), (unsigned long)durationS,
                  energyOK ? (String(usedWh) + " Wh").c_str() : "tidak tersedia (PZEM)",
                  (unsigned long)waitMs);
#if ENABLE_MQTT
    char buf[160];
    snprintf(buf, sizeof(buf), "{\"uid\":\"%s\",\"durasi_s\":%lu,\"energi_wh\":%ld,\"e_awal\":%lu,\"e_akhir\":%lu}",
             activeUserUID.c_str(), (unsigned long)durationS, energyOK ? (long)usedWh : -1L,
             (unsigned long)sessionStartWh, (unsigned long)pzem.energyWh);
    mqttPublish(TOPIC_SESSION, buf);
#endif
    String sub = energyOK ? (String(usedWh) + " Wh dipakai") : String("Session ended");
    setRelay(false);
    showOledNotice("RELAY OFF", sub, 2000, false);
}

void updateRelayCountdown() {
    if (manualRelayMode || !relayOffPending) return;
    uint32_t elapsed = millis() - relayOffStarted;
    if (elapsed >= RELAY_OFF_DELAY_MS) {
        finishSession(elapsed);
        return;
    }
    uint8_t remaining = (RELAY_OFF_DELAY_MS - elapsed + 999) / 1000;
    if (remaining != lastCountdown) {
        lastCountdown = remaining;
        Serial.printf("[RELAY] OFF dalam %u detik...\n", remaining);
    }
}

void updateCardModeTimeout() {
    if (cardMode != CardMode::NORMAL && millis() - cardModeStarted >= CARD_MODE_TIMEOUT_MS) {
        Serial.println("[KARTU] Waktu habis.");
        setCardMode(CardMode::NORMAL);
    }
}

// Tugas latar yang dipanggil sesering mungkin dari loop.
void serviceTasks() {
    updateBuzzer();
    updateRelayCountdown();
    if (!pzemWaiting && DashboardLink::sampleDue()) {
        pzemLastPoll = millis();
        pzemSendRequest();
    }
    updatePZEM();
}

void setup() {
    pinMode(PIN_RELAY, OUTPUT);
    digitalWrite(PIN_RELAY, RELAY_OFF_LEVEL);
    pinMode(PIN_BUZZER, INPUT_PULLUP);
    pinMode(PIN_LED_MOD, INPUT_PULLUP);
    pinMode(PIN_BUTTON, INPUT_PULLUP);
    buttonLastRaw = digitalRead(PIN_BUTTON);
    buttonHandled = buttonLastRaw == LOW;   // tombol tertahan saat boot tidak dihitung

    Serial.begin(115200);
    delay(1500);
    Serial.println("\n[BOOT] RFID + Relay + PZEM + WiFi | Node Mesin Cuci v4.2");
    Serial.println("[MODE] Hanya kartu terdaftar boleh membuka sesi; hanya pemilik boleh menutup.");
    Serial.printf("[GPIO] RFID SCK=%d MISO=%d MOSI=%d SS=%d RST=%d\n",
                  PIN_SPI_SCK, PIN_SPI_MISO, PIN_SPI_MOSI, PIN_RFID_SS, PIN_RFID_RST);
    Serial.printf("[GPIO] Relay=%d aktif %s | Tombol WiFi=%d | Buzzer=%d aktif LOW | OLED SDA=%d SCL=%d\n",
                  PIN_RELAY, RELAY_ACTIVE_LOW ? "LOW" : "HIGH", PIN_BUTTON, PIN_BUZZER,
                  PIN_OLED_SDA, PIN_OLED_SCL);
    setRelay(false);
    loadRegistered();
    printSerialHelp();
    initOLED();
    updateOLED();
    initPZEM();
#if ENABLE_MQTT
    mqtt.setServer(MQTT_SERVER, MQTT_PORT);
    mqtt.setKeepAlive(15);
    mqtt.setSocketTimeout(2);   // batasi blocking saat broker tidak bisa dihubungi
#endif
    initWiFi();
    DashboardLink::begin();

    rfidReady = initRFID();
    oledNoticeDuration = 0;
    oledDirty = true;
    if (!rfidReady) {
        Serial.println("[RFID] Gagal inisialisasi. Periksa wiring dan catu daya, lalu reset.");
    } else {
        Serial.println("[RFID] Siap. Tempelkan kartu terdaftar untuk membuka sesi.");
    }
    if (!ALLOW_SERIAL_ENROLL) {
        Serial.printf("[KARTU] Daftar dikunci: hanya %u kartu di DEFAULT_UIDS yang diizinkan.\n",
                      (unsigned)(sizeof(DEFAULT_UIDS) / sizeof(DEFAULT_UIDS[0])));
        listRegistered();
    } else if (registeredCount() == 0 && sizeof(DEFAULT_UIDS) == 0) {
        Serial.println("[KARTU] Belum ada kartu terdaftar: semua kartu akan DITOLAK.");
        Serial.println("[KARTU] Ketik E di Serial Monitor lalu tap kartu untuk mendaftarkan.");
    }
    updateOLED();
}

void loop() {
    DashboardLink::tick(rfidReady);
    pollSerialCommands();
    updateButton();
    updateWiFi();
    updateCardModeTimeout();
    serviceTasks();
    updateOLED();
    if (!rfidReady) {
        delay(1);
        return;
    }
    static uint32_t lastPoll = 0;
    if (millis() - lastPoll < 100) {
        delay(1);
        return;
    }
    lastPoll = millis();

    uint8_t uidBytes[10];
    uint8_t uidLength = 0;
    bool cardResponded = false;
    bool shutdownWasPending = relayOffPending;
    bool readOK = readCardUID(uidBytes, uidLength, cardResponded);
    serviceTasks();

    if (readOK) {
        absenceTracking = false;
        String uid = uidToString(uidBytes, uidLength);
        if (!cardLatched || uid != lastCardUID) {
            cardLatched = true;
            lastCardUID = uid;
            if (shutdownWasPending && !relayOffPending && !relayIsOn) {
                // Kartu mulai dibaca ketika sesi masih dalam countdown.
                // Jangan otomatis menjadikannya pemilik baru saat waktu OFF habis.
                Serial.printf("[AKSES] Tap UID=%s diabaikan saat penutupan sesi. Angkat lalu tap kembali.\n",
                              uid.c_str());
            } else {
                handleTap(uid, uidLength);
            }
        }
    } else if (cardResponded) {
        // Kartu menjawab tetapi UID belum valid: jangan dianggap sudah diangkat.
        absenceTracking = false;
        static uint32_t lastErrorLog = 0;
        if (millis() - lastErrorLog >= 1000) {
            lastErrorLog = millis();
            Serial.printf("[RFID] Kartu merespons, UID belum terbaca | IRQ=0x%02X ERROR=0x%02X\n",
                          lastRFIDIrq, lastRFIDError);
            Serial.println("[INFO] Angkat lalu tempelkan satu kartu saja.");
        }
        // Pulihkan state kartu jika proses SELECT terputus di tengah jalan.
        writeRegister(REG_TX_CONTROL, readRegister(REG_TX_CONTROL) & 0xFC);
        delay(10);
        writeRegister(REG_TX_CONTROL, readRegister(REG_TX_CONTROL) | 0x03);
        delay(10);
    } else if (cardLatched) {
        if (!absenceTracking) {
            absenceTracking = true;
            absenceStarted = millis();
        } else if (millis() - absenceStarted >= CARD_REMOVAL_MS) {
            cardLatched = false;
            lastCardUID = "";
            absenceTracking = false;
            Serial.println("[RFID] Kartu diangkat. Siap untuk tap berikutnya.");
        }
    }
    serviceTasks();
    updateOLED();
    delay(1);
}
