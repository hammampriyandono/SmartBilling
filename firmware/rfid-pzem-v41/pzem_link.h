#pragma once
#include <math.h>
#include "utc_sampling.h"

// UART stays in the original loop. Only fresh, boundary-triggered replies enter
// this queue; MQTT and durable storage run in the existing network task.
namespace DashboardLink {
class PzemStream {
    struct Sample {
        uint64_t measuredUs;
        uint32_t wh;
        float voltage, current, power, frequency, pf;
    };
    static constexpr uint32_t CAPACITY = 8;
    struct Entry { char wire[448]; };
    struct State {
        uint32_t version, epoch, lastWh, hasCounter, head, count;
        uint64_t lastMeasuredUs;
        char device[81];
        Entry entries[CAPACITY];
        uint32_t checksum;
    } state{};
    QueueHandle_t queue = nullptr;
    Preferences storage;
    UtcSampling sampling{60000000ULL, 1000000ULL};
    uint64_t pendingSlot = 0, lastCapturedUs = 0;
    uint32_t sequence = 0;
    std::atomic<bool> enabled{false};

    static uint32_t checksum(const State &s) {
        uint32_t crc = 0xffffffff;
        const uint8_t *p = reinterpret_cast<const uint8_t *>(&s);
        for (size_t i = 0; i < offsetof(State, checksum); ++i) {
            crc ^= p[i];
            for (int b = 0; b < 8; ++b) crc = (crc >> 1) ^ (0xedb88320U & (0U - (crc & 1)));
        }
        return ~crc;
    }
    bool save() {
        state.checksum = checksum(state);
        if (storage.putBytes("state", &state, sizeof(state)) == sizeof(state)) return true;
        enabled = false;
        Serial.println("[PZEM DASHBOARD] NVS gagal; pengiriman dihentikan, kontrol lokal tetap berjalan.");
        return false;
    }
    static uint64_t nowUs() {
        timeval tv; gettimeofday(&tv, nullptr);
        return uint64_t(tv.tv_sec) * 1000000 + tv.tv_usec;
    }
public:
    void begin() {
        if (!storage.begin("sb-v41-pzem-v1", false)) return;
        if (storage.isKey("state")) {
            if (storage.getBytesLength("state") != sizeof(state)
                || storage.getBytes("state", &state, sizeof(state)) != sizeof(state)
                || state.version != 1 || state.checksum != checksum(state)
                || state.head >= CAPACITY || state.count > CAPACITY
                || state.epoch > 2147483647U || state.hasCounter > 1
                || strnlen(state.device, sizeof(state.device)) >= sizeof(state.device)
                || strcmp(state.device, DEVICE_UID) != 0) {
                Serial.println("[PZEM DASHBOARD] Checkpoint tidak cocok/rusak; tidak dihapus.");
                return;
            }
            for (uint32_t i = 0; i < state.count; ++i) {
                const char *wire = state.entries[(state.head + i) % CAPACITY].wire;
                JsonDocument doc;
                if (strnlen(wire, 448) >= 448 || deserializeJson(doc, wire)
                    || doc["schema_version"] != 1 || doc["channel_no"] != 1) return;
            }
        } else {
            state.version = 1;
            snprintf(state.device, sizeof(state.device), "%s", DEVICE_UID);
            if (!save()) return;
        }
        lastCapturedUs = state.lastMeasuredUs;
        queue = xQueueCreate(CAPACITY, sizeof(Sample));
        enabled = queue != nullptr;
    }
    bool due(bool clockReady) {
        if (!enabled || !clockReady) return false;
        const uint64_t now = nowUs();
        if (pendingSlot && (now < pendingSlot || now - pendingSlot > 2000000ULL)) pendingSlot = 0;
        uint64_t slot = 0;
        const SamplingTick tick = sampling.poll(now, lastCapturedUs, slot);
        if (tick == SamplingTick::missed) Serial.println("[PZEM DASHBOARD] Putaran UTC terlewat; tanpa sampel pengganti.");
        if (tick != SamplingTick::due) return false;
        pendingSlot = slot;
        return true;
    }
    void failed() { pendingSlot = 0; }
    void reading(bool clockReady, float voltage, float current, float power,
                 uint32_t wh, float frequency, float pf) {
        if (!enabled || !pendingSlot) return;
        const uint64_t slot = pendingSlot; pendingSlot = 0;
        const uint64_t measured = nowUs();
        if (!clockReady || measured < slot || measured - slot > 2000000ULL || measured <= lastCapturedUs
            || !isfinite(voltage) || voltage < 0 || !isfinite(current) || current < 0
            || !isfinite(power) || power < 0 || !isfinite(frequency) || frequency < 0
            || !isfinite(pf) || pf < 0 || pf > 1) return;
        Sample sample{measured, wh, voltage, current, power, frequency, pf};
        lastCapturedUs = measured;
        if (xQueueSend(queue, &sample, 0) != pdTRUE)
            Serial.println("[PZEM DASHBOARD] Antrean RAM penuh; sampel hilang, tidak diganti nol.");
    }
    // Called only by the network task; no simultaneous Preferences operations.
    void service(MQTTClient &mqtt, const String &boot) {
        if (!enabled) return;
        Sample s{};
        while (xQueueReceive(queue, &s, 0) == pdTRUE) {
            if (state.hasCounter && s.wh < state.lastWh) {
                if (state.epoch == 2147483647U) { enabled = false; return; }
                ++state.epoch;
            }
            state.lastWh = s.wh; state.hasCounter = 1; state.lastMeasuredUs = s.measuredUs;
            if (sequence == UINT32_MAX) { enabled = false; return; }
            const uint32_t seq = sequence++;
            if (state.count == CAPACITY) {
                if (!save()) return;
                Serial.println("[PZEM DASHBOARD] Antrean NVS penuh; sampel baru hilang.");
                continue;
            }
            const time_t seconds = s.measuredUs / 1000000;
            tm utc; gmtime_r(&seconds, &utc);
            char date[25], timestamp[32], energy[28];
            strftime(date, sizeof(date), "%Y-%m-%dT%H:%M:%S", &utc);
            snprintf(timestamp, sizeof(timestamp), "%s.%03ldZ", date, long(s.measuredUs % 1000000 / 1000));
            snprintf(energy, sizeof(energy), "%lu.%03lu", (unsigned long)(s.wh / 1000), (unsigned long)(s.wh % 1000));
            Entry &entry = state.entries[(state.head + state.count) % CAPACITY];
            const int length = snprintf(entry.wire, sizeof(entry.wire),
                "{\"schema_version\":1,\"boot_id\":\"%s\",\"sequence_no\":%lu,\"channel_no\":1,\"counter_epoch\":%lu,\"measured_at\":\"%s\",\"energy_kwh\":\"%s\",\"voltage_v\":%.1f,\"current_a\":%.3f,\"power_w\":%.1f,\"frequency_hz\":%.1f,\"power_factor\":%.2f}",
                boot.c_str(), (unsigned long)seq, (unsigned long)state.epoch, timestamp, energy,
                s.voltage, s.current, s.power, s.frequency, s.pf);
            if (length <= 0 || size_t(length) >= sizeof(entry.wire)) { enabled = false; return; }
            ++state.count;
            if (!save()) return;
            Serial.printf("[PZEM DASHBOARD] Sampel UTC %s: %.1f V | %.3f A | %.1f W | %s kWh.\n", timestamp, s.voltage, s.current, s.power, energy);
        }
        // Let a small positive clock offset settle without changing acquisition time.
        if (mqtt.connected() && state.count && nowUs() >= state.lastMeasuredUs + 1000000ULL) {
            const String topic = String("smartbilling/v1/devices/") + DEVICE_UID + "/readings";
            if (mqtt.publish(topic, state.entries[state.head].wire, false, 1)) {
                state.head = (state.head + 1) % CAPACITY; --state.count;
                save();
                Serial.println("[PZEM DASHBOARD] PUBACK diterima; penyimpanan diperiksa melalui dashboard.");
            } else mqtt.disconnect();
        }
    }
};
inline PzemStream sensor;
} // namespace DashboardLink
