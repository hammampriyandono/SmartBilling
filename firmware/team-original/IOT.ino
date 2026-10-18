#include <Arduino.h>
#include <SPI.h>
#include <Wire.h>
#include <WiFi.h>
#include <PubSubClient.h> 
#include <Adafruit_SSD1306.h>
#include <esp_netif.h>

#include "bongo.h"
#include "secrets.h" 

// ===== Setup Server MQTT =====
// Tulis langsung di sini agar tidak mengganggu secrets.h
#define MQTT_SERVER "broker.hivemq.com" 
#define MQTT_PORT 1883

// ===== Pin MFRC522 =====
#define RFID_SCK_PIN  4
#define RFID_MISO_PIN 5
#define RFID_MOSI_PIN 6
#define RFID_CS_PIN   7
#define RFID_RST_PIN  10

// ===== PIN RELAY =====
#define RELAY_PIN     3 

// ===== Register MFRC522 =====
#define MFRC522_REG_COMMAND      0x01
#define MFRC522_REG_COMIEN       0x02
#define MFRC522_REG_COMIRQ       0x04
#define MFRC522_REG_ERROR        0x06
#define MFRC522_REG_FIFODATA     0x09
#define MFRC522_REG_FIFOLEVEL    0x0A
#define MFRC522_REG_CONTROL      0x0C
#define MFRC522_REG_BITFRAMING   0x0D
#define MFRC522_REG_MODE         0x11
#define MFRC522_REG_TXCONTROL    0x14
#define MFRC522_REG_TXASK        0x15
#define MFRC522_REG_TMODE        0x2A
#define MFRC522_REG_TPRESCALER   0x2B
#define MFRC522_REG_TRELOADL     0x2D
#define MFRC522_REG_TRELOADH     0x2C
#define MFRC522_REG_VERSION      0x37

#define PCD_IDLE       0x00
#define PCD_TRANSCEIVE 0x0C
#define PCD_RESETPHASE 0x0F
#define PICC_REQIDL    0x26
#define PICC_ANTICOLL  0x93
#define MI_OK   0
#define MI_ERR  2
#define MFRC522_BUF_SIZE 16

// ===== OLED SSD1306 =====
#define OLED_SDA_PIN 0
#define OLED_SCL_PIN 1
#define OLED_WIDTH   128
#define OLED_HEIGHT  64
#define OLED_ADDR    0x3C

Adafruit_SSD1306 display(OLED_WIDTH, OLED_HEIGHT, &Wire, -1);

bool wifiReady = false;
bool oledReady = false;

// ===== Variabel Status Relay =====
bool relayIsOn = false;
String activeUserUID = "";

// ===== Setup MQTT =====
WiFiClient espClient;
PubSubClient mqtt(espClient);

String mqttResponse = "";
bool responseReceived = false;

// Deklarasi fungsi OLED
void oledShow(const String &line1, uint8_t size1, const String &line2, uint8_t size2);
void oledIdle(uint8_t frame = 0);

void mqttCallback(char* topic, byte* payload, unsigned int length) {
    String msg = "";
    for (int i = 0; i < length; i++) {
        msg += (char)payload[i];
    }
    
    if (String(topic) == "rfid/response") {
        mqttResponse = msg;
        responseReceived = true;
    }
}

void reconnectMQTT() {
    while (!mqtt.connected()) {
        oledShow("MQTT", 2, "Connecting", 1);
        String clientId = "ESP32C3-RFID-" + String(random(0xffff), HEX);
        
        if (mqtt.connect(clientId.c_str())) {
            mqtt.subscribe("rfid/response");
            oledIdle(); 
        } else {
            delay(2000);
        }
    }
}

// ==========================================
// Fungsi Animasi
// ==========================================
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
    if (relayIsOn) {
        oledCat(bongoIdle[frame % BONGO_IDLE_FRAMES], "IN USE", 28);
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

volatile bool loadingRun = false;
volatile bool loadingDone = true;

void loadingTask(void *param) {
    uint8_t frame = 0;
    while (loadingRun) {
        oledCat(bongoTap[frame], "Checking", 16);
        frame = (frame + 1) % BONGO_TAP_FRAMES;
        for (int i = 0; i < 3 && loadingRun; i++) vTaskDelay(pdMS_TO_TICKS(50));
    }
    loadingDone = true;
    vTaskDelete(NULL);
}

void loadingStart() {
    if (!loadingDone) return;
    loadingRun = true;
    loadingDone = false;
    xTaskCreate(loadingTask, "loading", 4096, NULL, 1, NULL);
}

void loadingStop() {
    loadingRun = false;
    while (!loadingDone) delay(10);
}

void connectWiFi() {
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    int timeoutCount = 0;
    while (WiFi.status() != WL_CONNECTED && timeoutCount < 40) {
        delay(500);
        timeoutCount++;
    }
    wifiReady = (WiFi.status() == WL_CONNECTED);
}

int sendTap(const String &uid, String &responseOut) {
    String payload = "{\"uid\":\"" + uid + "\"}";
    responseReceived = false;
    mqttResponse = "";
    
    mqtt.publish("rfid/tap", payload.c_str());

    uint32_t startWait = millis();
    while (!responseReceived && (millis() - startWait < 8000)) {
        mqtt.loop(); 
        delay(10);
    }

    if (responseReceived) {
        responseOut = mqttResponse;
        return 200; 
    } else {
        return -1;  
    }
}

String jsonField(const String &json, const String &key) {
    int k = json.indexOf("\"" + key + "\"");
    if (k < 0) return "";
    int colon = json.indexOf(':', k);
    if (colon < 0) return "";
    int q1 = json.indexOf('"', colon);
    int q2 = (q1 < 0) ? -1 : json.indexOf('"', q1 + 1);
    if (q1 < 0 || q2 < 0) return "";
    return json.substring(q1 + 1, q2);
}

// ==========================================
// Driver MFRC522 
// ==========================================
uint8_t MFRC522_ReadRegister(uint8_t reg) {
    uint8_t addr = ((reg << 1) & 0x7E) | 0x80;
    SPI.beginTransaction(SPISettings(4000000, MSBFIRST, SPI_MODE0));
    digitalWrite(RFID_CS_PIN, LOW);
    SPI.transfer(addr);
    uint8_t value = SPI.transfer(0x00);
    digitalWrite(RFID_CS_PIN, HIGH);
    SPI.endTransaction();
    return value;
}
void MFRC522_WriteRegister(uint8_t reg, uint8_t value) {
    uint8_t addr = (reg << 1) & 0x7E;
    SPI.beginTransaction(SPISettings(4000000, MSBFIRST, SPI_MODE0));
    digitalWrite(RFID_CS_PIN, LOW);
    SPI.transfer(addr);
    SPI.transfer(value);
    digitalWrite(RFID_CS_PIN, HIGH);
    SPI.endTransaction();
}
void MFRC522_SetBitMask(uint8_t reg, uint8_t mask) { MFRC522_WriteRegister(reg, MFRC522_ReadRegister(reg) | mask); }
void MFRC522_ClearBitMask(uint8_t reg, uint8_t mask) { MFRC522_WriteRegister(reg, MFRC522_ReadRegister(reg) & (~mask)); }
void MFRC522_AntennaOn() { if (!(MFRC522_ReadRegister(MFRC522_REG_TXCONTROL) & 0x03)) MFRC522_SetBitMask(MFRC522_REG_TXCONTROL, 0x03); }

bool MFRC522_Init() {
    pinMode(RFID_CS_PIN, OUTPUT);
    pinMode(RFID_RST_PIN, OUTPUT);
    digitalWrite(RFID_CS_PIN, HIGH);
    digitalWrite(RFID_RST_PIN, HIGH);
    delay(50);
    SPI.begin(RFID_SCK_PIN, RFID_MISO_PIN, RFID_MOSI_PIN, RFID_CS_PIN);
    MFRC522_WriteRegister(MFRC522_REG_COMMAND, PCD_RESETPHASE); delay(50);
    MFRC522_WriteRegister(MFRC522_REG_TMODE, 0x8D); MFRC522_WriteRegister(MFRC522_REG_TPRESCALER, 0x3E);
    MFRC522_WriteRegister(MFRC522_REG_TRELOADL, 30); MFRC522_WriteRegister(MFRC522_REG_TRELOADH, 0);
    MFRC522_WriteRegister(MFRC522_REG_TXASK, 0x40); MFRC522_WriteRegister(MFRC522_REG_MODE, 0x3D);
    MFRC522_AntennaOn();
    uint8_t version = MFRC522_ReadRegister(MFRC522_REG_VERSION);
    return version != 0x00 && version != 0xFF;
}

uint8_t MFRC522_ToCard(uint8_t command, uint8_t *sendData, uint8_t sendLen, uint8_t *backData, uint16_t *backLen) {
    uint8_t status = MI_ERR; uint8_t irqEn = 0x00; uint8_t waitIRq = 0x00; uint8_t lastBits; uint8_t n; uint32_t i;
    if (command == PCD_TRANSCEIVE) { irqEn = 0x77; waitIRq = 0x30; }
    MFRC522_WriteRegister(MFRC522_REG_COMIEN, irqEn | 0x80); MFRC522_ClearBitMask(MFRC522_REG_COMIRQ, 0x80);
    MFRC522_SetBitMask(MFRC522_REG_FIFOLEVEL, 0x80); MFRC522_WriteRegister(MFRC522_REG_COMMAND, PCD_IDLE);
    for (i = 0; i < sendLen; i++) MFRC522_WriteRegister(MFRC522_REG_FIFODATA, sendData[i]);
    MFRC522_WriteRegister(MFRC522_REG_COMMAND, command);
    if (command == PCD_TRANSCEIVE) MFRC522_SetBitMask(MFRC522_REG_BITFRAMING, 0x80);
    i = 2000;
    do { n = MFRC522_ReadRegister(MFRC522_REG_COMIRQ); i--; } while ((i != 0) && !(n & 0x01) && !(n & waitIRq));
    MFRC522_ClearBitMask(MFRC522_REG_BITFRAMING, 0x80);
    if (i != 0 && !(MFRC522_ReadRegister(MFRC522_REG_ERROR) & 0x1B)) {
        status = (n & irqEn & 0x01) ? MI_ERR : MI_OK;
        if (command == PCD_TRANSCEIVE) {
            n = MFRC522_ReadRegister(MFRC522_REG_FIFOLEVEL); lastBits = MFRC522_ReadRegister(MFRC522_REG_CONTROL) & 0x07;
            *backLen = lastBits ? (n - 1) * 8 + lastBits : n * 8;
            if (n == 0) n = 1; if (n > MFRC522_BUF_SIZE) n = MFRC522_BUF_SIZE;
            for (i = 0; i < n; i++) backData[i] = MFRC522_ReadRegister(MFRC522_REG_FIFODATA);
        }
    }
    return status;
}

uint8_t MFRC522_Request(uint8_t reqMode, uint8_t *TagType) {
    uint16_t backBits; MFRC522_WriteRegister(MFRC522_REG_BITFRAMING, 0x07);
    TagType[0] = reqMode; uint8_t status = MFRC522_ToCard(PCD_TRANSCEIVE, TagType, 1, TagType, &backBits);
    return (status == MI_OK && backBits == 0x10) ? MI_OK : MI_ERR;
}

uint8_t MFRC522_Anticoll(uint8_t *serNum) {
    uint8_t serNumCheck = 0; uint16_t unLen; MFRC522_WriteRegister(MFRC522_REG_BITFRAMING, 0x00);
    serNum[0] = PICC_ANTICOLL; serNum[1] = 0x20;
    uint8_t status = MFRC522_ToCard(PCD_TRANSCEIVE, serNum, 2, serNum, &unLen);
    if (status == MI_OK) {
        for (uint8_t i = 0; i < 4; i++) serNumCheck ^= serNum[i];
        if (serNumCheck != serNum[4]) status = MI_ERR;
    }
    return status;
}

String uidToString(uint8_t *serNum) {
    char buf[9]; sprintf(buf, "%02X%02X%02X%02X", serNum[0], serNum[1], serNum[2], serNum[3]);
    return String(buf);
}

void setup() {
    oledInit();
    
    // Inisialisasi Relay untuk tipe Active-LOW dengan trik Open Drain
    pinMode(RELAY_PIN, OUTPUT_OPEN_DRAIN); 
    digitalWrite(RELAY_PIN, HIGH);
    
    oledShow("WiFi", 2, "connecting...", 1);
    connectWiFi();

    mqtt.setServer(MQTT_SERVER, MQTT_PORT);
    mqtt.setCallback(mqttCallback);

    if (!MFRC522_Init()) {
        oledShow("RFID", 2, "check wiring", 1);
        while (true) delay(1000);
    }
    oledIdle();
}

void loop() {
    if (!wifiReady || WiFi.status() != WL_CONNECTED) {
        oledShow("No WiFi", 2, "reconnecting...", 1);
        connectWiFi();
        if (wifiReady) reconnectMQTT();
        return;
    }

    if (!mqtt.connected()) {
        reconnectMQTT();
    }
    mqtt.loop(); 

    uint8_t TagType[MFRC522_BUF_SIZE];
    uint8_t serNum[MFRC522_BUF_SIZE];

    if (MFRC522_Request(PICC_REQIDL, TagType) == MI_OK && MFRC522_Anticoll(serNum) == MI_OK) {
        String uid = uidToString(serNum);
        String response;

        loadingStart();
        int httpCode = sendTap(uid, response); 
        loadingStop();

        String status = (httpCode == 200) ? jsonField(response, "status") : "";

        // Logika Relay Active-LOW
        if (status == "OK") {
            String nama = jsonField(response, "nama");

            if (!relayIsOn) {
                // Skenario 1: Relay Mati, lalu dihidupkan
                digitalWrite(RELAY_PIN, LOW);  // Beri LOW agar relay HIDUP
                relayIsOn = true;              
                activeUserUID = uid;           
                
                oledShow("Access Granted", 1, nama + "\nRelay ON", 2);
            } else {
                // Skenario 2: Relay Sedang Hidup
                if (uid == activeUserUID) {
                    // Skenario 2A: User yang sama tap untuk mematikan
                    oledShow("Turning OFF", 2, "Wait 5 sec...", 1);
                    
                    // Delay 5 detik tanpa bisa diinterupsi
                    uint32_t startDelay = millis();
                    while (millis() - startDelay < 5000) {
                        mqtt.loop();
                        delay(10);
                    }
                    
                    digitalWrite(RELAY_PIN, HIGH); // Beri HIGH agar relay MATI
                    relayIsOn = false;
                    activeUserUID = "";
                    
                    oledShow("Relay OFF", 2, "Goodbye", 2);
                } else {
                    // Skenario 2B: Orang lain mencoba tap saat alat dipakai
                    oledShow("Access Denied", 1, "In Use by\nAnother User", 1);
                }
            }
            
        } else if (status == "REJECTED") {
            oledShow(uid, 2, "please register", 1);
        } else if (httpCode <= 0) {
            oledShow("Timeout", 2, "No Server Reply", 1);
        } else {
            oledShow("Error", 2, "Format Salah", 1);
        }

        delay(4000); 
        oledIdle();
    } else {
        oledIdleAnimate();
    }
    delay(50);
}
