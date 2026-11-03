#pragma once

// Additive dashboard transport. All MQTT/NVS work runs in its own task;
// the v4.1 loop still owns RFID, PZEM, OLED, buzzer and the local relay.
#include <Arduino.h>
#include <WiFi.h>
#include <MQTT.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <atomic>
#include <time.h>
#include <sys/time.h>
#include <esp_system.h>
#include <esp_sntp.h>
#include <mbedtls/sha256.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <freertos/queue.h>
#ifdef RFID_USE_EXAMPLE_SECRETS
#include "secrets.example.h"
#else
#include "secrets.h"
#endif

#include "pzem_link.h"

namespace DashboardLink {
inline std::atomic<bool> timeSynced{false};
inline std::atomic<uint32_t> timeSyncedAt{0};
inline void synced(struct timeval *) {
    timeSyncedAt.store(millis());
    timeSynced.store(true);
}
inline bool clockReady() {
    return timeSynced.load()
        && uint32_t(millis() - timeSyncedAt.load()) < 21600000UL
        && time(nullptr) >= 1767225600;
}

struct Tap {
    char uid[21];
    int64_t occurredUs;
};

class Client {
public:
    void begin() {
        String mac = WiFi.macAddress();
        mac.replace(":", "");
        mac.toLowerCase();
        if (mac != EXPECTED_MAC_HEX) {
            Serial.println("[DASHBOARD] MAC tidak cocok; pengiriman dinonaktifkan.");
            return;
        }
        sensor.begin();
        queue = xQueueCreate(1, sizeof(Tap));
        if (!queue || xTaskCreate(taskEntry, "rfid-dashboard", 12288,
                                  this, 1, nullptr) != pdPASS) {
            if (queue) { vQueueDelete(queue); queue = nullptr; }
            Serial.println("[DASHBOARD] Task/antrean tidak tersedia; mode lokal tetap berjalan.");
        }
    }

    void reader(bool ready) { readerReady.store(ready); }

    void tap(const String &uid) {
        if (!queue || !healthy.load() || !online.load() || !clockReady()) {
            Serial.println("[DASHBOARD] Tap belum dikirim; tunggu MQTT/NTP, angkat lalu tap ulang.");
            return;
        }
        bool expected = false;
        if (!busy.compare_exchange_strong(expected, true)) {
            Serial.println("[DASHBOARD] Masih ada tap pending; tap baru tidak direkam.");
            return;
        }
        if (!validUid(uid)) { busy.store(false); return; }
        struct timeval now;
        gettimeofday(&now, nullptr);
        Tap item{};
        uid.toCharArray(item.uid, sizeof(item.uid));
        item.occurredUs = int64_t(now.tv_sec) * 1000000 + now.tv_usec;
        if (xQueueSend(queue, &item, 0) != pdTRUE) {
            busy.store(false);
            Serial.println("[DASHBOARD] Antrean sibuk; angkat lalu tap ulang.");
        }
    }

private:
    static constexpr uint64_t MAX_SEQUENCE = 9007199254740991ULL;
    QueueHandle_t queue = nullptr;
    std::atomic<bool> healthy{false}, online{false}, busy{true}, readerReady{false};
    WiFiClient network;
    MQTTClient mqtt{2048};
    Preferences storage;
    JsonDocument checkpoint;
    String boot, tapsTopic, responsesTopic, statusTopic;
    String pending, pendingHash, responseQueue;
    bool stopped = false, ntpStarted = false;
    uint32_t lastConnect = 0, lastPublish = 0, lastStatus = 0, lastNtp = 0;

    static void taskEntry(void *self) { static_cast<Client *>(self)->run(); }

    static bool validUid(const String &uid) {
        if (uid.length() != 8 && uid.length() != 14 && uid.length() != 20) return false;
        for (size_t i = 0; i < uid.length(); i++) {
            const char c = uid[i];
            if (!((c >= '0' && c <= '9') || (c >= 'A' && c <= 'F'))) return false;
        }
        return true;
    }

    static bool validBoot(const String &id) {
        if (id.length() != 36) return false;
        for (size_t i = 0; i < id.length(); i++) {
            if (i == 8 || i == 13 || i == 18 || i == 23) {
                if (id[i] != '-') return false;
            } else if (!((id[i] >= '0' && id[i] <= '9') || (id[i] >= 'a' && id[i] <= 'f'))) return false;
        }
        return true;
    }

    static String uuid() {
        uint8_t b[16]; esp_fill_random(b, sizeof(b));
        b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
        char value[37];
        snprintf(value, sizeof(value),
            "%02x%02x%02x%02x-%02x%02x-%02x%02x-%02x%02x-%02x%02x%02x%02x%02x%02x",
            b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7],
            b[8], b[9], b[10], b[11], b[12], b[13], b[14], b[15]);
        return String(value);
    }

    static String sha256(const String &wire) {
        uint8_t hash[32];
        if (mbedtls_sha256(reinterpret_cast<const unsigned char *>(wire.c_str()),
                           wire.length(), hash, 0) != 0) return "";
        char result[65];
        for (int i = 0; i < 32; i++) snprintf(result + i * 2, 3, "%02x", hash[i]);
        result[64] = '\0';
        return String(result);
    }

    void fail(const char *reason) {
        stopped = true; healthy.store(false); busy.store(true);
        lastStatus = millis() - 15000;
        Serial.printf("[DASHBOARD] Pengiriman dihentikan: %s. Kontrol lokal tetap berjalan.\n", reason);
    }

    bool save() {
        if (checkpoint.overflowed()) { fail("buffer NVS"); return false; }
        String wire; serializeJson(checkpoint, wire);
        if (wire.isEmpty() || storage.putString("state", wire) != wire.length()) {
            fail("gagal tulis NVS"); return false;
        }
        return true;
    }

    bool load() {
        if (!storage.begin("sb-rfid-v1", false)) { fail("NVS tidak tersedia"); return false; }
        if (!storage.isKey("state")) {
            checkpoint["version"] = 1; checkpoint["device_uid"] = DEVICE_UID;
            checkpoint["channel"] = READER_CHANNEL; checkpoint["head"] = nullptr;
            checkpoint["pending"] = nullptr; checkpoint["pending_sha256"] = nullptr;
            return save();
        }
        const String saved = storage.getString("state", "");
        if (saved.isEmpty() || deserializeJson(checkpoint, saved)
            || checkpoint["version"] != 1
            || checkpoint["device_uid"].as<String>() != DEVICE_UID
            || !checkpoint["channel"].is<int>() || checkpoint["channel"].as<int>() != READER_CHANNEL) {
            fail("checkpoint/config tidak cocok"); return false;
        }
        JsonVariant head = checkpoint["head"];
        if (!head.isNull() && (!head.is<JsonObject>() || head.size() != 2
            || !validBoot(head["boot_id"].as<String>()) || !head["sequence_no"].is<uint64_t>()
            || head["sequence_no"].as<uint64_t>() > MAX_SEQUENCE)) {
            fail("head rusak"); return false;
        }
        if (checkpoint["pending"].isNull()) {
            if (!checkpoint["pending_sha256"].isNull()) { fail("pending tidak konsisten"); return false; }
            return true;
        }
        pending = checkpoint["pending"].as<String>();
        pendingHash = checkpoint["pending_sha256"].as<String>();
        JsonDocument event;
        if (pending.isEmpty() || pending.length() > 1800 || pendingHash.length() != 64
            || sha256(pending) != pendingHash || deserializeJson(event, pending)
            || !event.is<JsonObject>() || event.size() != 7 || event["schema_version"] != 1
            || !validBoot(event["boot_id"].as<String>()) || !event["sequence_no"].is<uint64_t>()
            || event["sequence_no"].as<uint64_t>() > MAX_SEQUENCE
            || !event["reader_channel"].is<int>() || event["reader_channel"].as<int>() != READER_CHANNEL
            || !validUid(event["card_uid"].as<String>()) || !event["occurred_at"].is<String>()) {
            fail("pending rusak"); return false;
        }
        JsonVariant previous = event["previous_event"];
        if (previous.isNull() != head.isNull()) { fail("rantai pending rusak"); return false; }
        const uint64_t seq = event["sequence_no"].as<uint64_t>();
        if (head.isNull()) {
            if (seq != 0) { fail("sequence awal"); return false; }
        } else {
            const uint64_t prev = head["sequence_no"].as<uint64_t>();
            const bool same = event["boot_id"].as<String>() == head["boot_id"].as<String>();
            if (!previous.is<JsonObject>() || previous.size() != 2
                || !previous["sequence_no"].is<uint64_t>()
                || previous["boot_id"].as<String>() != head["boot_id"].as<String>()
                || previous["sequence_no"].as<uint64_t>() != prev
                || (same && (prev >= MAX_SEQUENCE || seq != prev + 1)) || (!same && seq != 0)) {
                fail("predecessor pending"); return false;
            }
        }
        return true;
    }

    String status(bool connected) {
        JsonDocument p;
        p["schema_version"] = 1; p["boot_id"] = boot; p["connected"] = connected;
        p["reader_state"] = !connected ? "unknown" : stopped ? "error"
            : readerReady.load() ? "ready" : "unavailable";
        p["ntp_synced"] = clockReady(); p["pending_tap"] = !pending.isEmpty();
        p["uptime_ms"] = millis();
        String wire; serializeJson(p, wire); return wire;
    }

    void capture(const Tap &item) {
        JsonDocument event;
        JsonVariant head = checkpoint["head"];
        uint64_t seq = 0;
        if (!head.isNull() && head["boot_id"].as<String>() == boot) {
            if (head["sequence_no"].as<uint64_t>() >= MAX_SEQUENCE) { fail("sequence habis"); return; }
            seq = head["sequence_no"].as<uint64_t>() + 1;
        }
        event["schema_version"] = 1; event["boot_id"] = boot; event["sequence_no"] = seq;
        if (head.isNull()) event["previous_event"] = nullptr;
        else event["previous_event"].set(head);
        event["reader_channel"] = READER_CHANNEL; event["card_uid"] = item.uid;
        const time_t seconds = item.occurredUs / 1000000;
        struct tm utc; gmtime_r(&seconds, &utc);
        char date[25], timestamp[32]; strftime(date, sizeof(date), "%Y-%m-%dT%H:%M:%S", &utc);
        snprintf(timestamp, sizeof(timestamp), "%s.%03ldZ", date, long(item.occurredUs % 1000000 / 1000));
        event["occurred_at"] = timestamp;
        if (event.overflowed()) { fail("buffer tap"); return; }
        String wire; serializeJson(event, wire);
        const String hash = sha256(wire);
        if (hash.isEmpty()) { fail("hash tap"); return; }
        checkpoint["pending"] = wire; checkpoint["pending_sha256"] = hash;
        if (!save()) return; // Durable before publish; RAM queue alone is not persistence.
        pending = wire; pendingHash = hash;
        lastPublish = millis() - 4000; lastStatus = millis() - 15000;
        Serial.println("[DASHBOARD] Tap disimpan; menunggu hasil backend.");
    }

    void handleResponse() {
        if (responseQueue.isEmpty()) return;
        String incoming = responseQueue; responseQueue = "";
        if (stopped || pending.isEmpty()) return;
        JsonDocument response, event;
        if (deserializeJson(response, incoming)) return;
        if (deserializeJson(event, pending)) { fail("pending invalid"); return; }
        if (response["schema_version"] != 1 || response["device_uid"].as<String>() != DEVICE_UID
            || response["boot_id"].as<String>() != event["boot_id"].as<String>()
            || !response["sequence_no"].is<uint64_t>()
            || response["sequence_no"].as<uint64_t>() != event["sequence_no"].as<uint64_t>()
            || response["request_sha256"].as<String>() != pendingHash) return;
        const String result = response["status"].as<String>(), action = response["action"].as<String>();
        if (result == "pending") return;
        const bool consumed = response["consumed"].is<bool>() && response["consumed"].as<bool>();
        if (!consumed || !(result == "rejected" || (result == "processed" && (action == "opened" || action == "closed")))) {
            fail("perlu pemeriksaan backend; pending dipertahankan"); return;
        }
        checkpoint["head"]["boot_id"] = event["boot_id"];
        checkpoint["head"]["sequence_no"] = event["sequence_no"];
        checkpoint["pending"] = nullptr; checkpoint["pending_sha256"] = nullptr;
        if (!save()) return; // Atomic head+clear, independent of the local relay.
        pending = ""; pendingHash = ""; busy.store(false); lastStatus = millis() - 15000;
        Serial.printf("[DASHBOARD] Hasil tap: %s / %s / %s. Relay tetap mengikuti mode lokal.\n",
            result.c_str(), action.c_str(), response["reason"].as<String>().c_str());
    }

    void run() {
        boot = uuid();
        tapsTopic = String("smartbilling/v1/devices/") + DEVICE_UID + "/rfid/taps";
        responsesTopic = String("smartbilling/v1/devices/") + DEVICE_UID + "/rfid/responses";
        statusTopic = String("smartbilling/v1/devices/") + DEVICE_UID + "/rfid/status";
        if (load()) { healthy.store(true); busy.store(!pending.isEmpty()); }
        mqtt.begin(MQTT_HOST, MQTT_PORT, network);
        mqtt.setOptions(30, true, 1000);
        mqtt.onMessage([this](String &topic, String &message) {
            if (topic == responsesTopic && message.length() <= 2048) responseQueue = message;
        });
        esp_sntp_set_time_sync_notification_cb(synced);
        lastConnect = millis() - 5000; lastStatus = millis() - 15000;
        Serial.println("[DASHBOARD] Transport v1 aktif; GPIO dan kendali relay tetap milik program lokal.");
        for (;;) {
            if (WiFi.status() == WL_CONNECTED) {
                if (!clockReady() && (!ntpStarted || uint32_t(millis() - lastNtp) >= 60000)) {
                    ntpStarted = true; lastNtp = millis();
                    configTime(0, 0, NTP_SERVER, "time.google.com", "time.cloudflare.com");
                }
                if (!mqtt.connected() && uint32_t(millis() - lastConnect) >= 5000) {
                    lastConnect = millis();
                    String will = status(false); mqtt.setWill(statusTopic.c_str(), will.c_str(), true, 1);
                    String clientId = String("sb-rfid-") + DEVICE_UID;
                    if (mqtt.connect(clientId.c_str(), MQTT_USERNAME, MQTT_PASSWORD)) {
                        if (!mqtt.subscribe(responsesTopic, 1)) mqtt.disconnect();
                        else { lastStatus = millis() - 15000; Serial.println("[DASHBOARD] MQTT terhubung."); }
                    }
                }
                online.store(mqtt.connected());
                if (mqtt.connected()) { mqtt.loop(); handleResponse(); }
            } else {
                online.store(false);
                if (mqtt.connected()) mqtt.disconnect();
            }
            if (!stopped && pending.isEmpty()) {
                Tap item{};
                if (xQueueReceive(queue, &item, 0) == pdTRUE) capture(item);
            }
            if (!stopped && mqtt.connected() && !pending.isEmpty() && uint32_t(millis() - lastPublish) >= 5000) {
                lastPublish = millis(); mqtt.publish(tapsTopic, pending, false, 1); handleResponse();
            }
            if (mqtt.connected() && uint32_t(millis() - lastStatus) >= 15000) {
                lastStatus = millis(); mqtt.publish(statusTopic, status(true), false, 1);
            }
            sensor.service(mqtt, boot);
            vTaskDelay(pdMS_TO_TICKS(10));
        }
    }
};

inline Client client;
inline void begin() { client.begin(); }
inline void tick(bool readerReady) { client.reader(readerReady); }
inline void tap(const String &uid) { client.tap(uid); }
inline bool sampleDue() { return sensor.due(clockReady()); }
inline void sensorFailed() { sensor.failed(); }
inline void sensorReading(float v, float a, float w, uint32_t wh, float hz, float pf) {
    sensor.reading(clockReady(), v, a, w, wh, hz, pf);
}
} // namespace DashboardLink
