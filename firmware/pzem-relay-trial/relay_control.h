#pragma once
#include <Arduino.h>
#include <driver/gpio.h>

constexpr int RELAY_PIN = 3;
// Set false for an active-HIGH module. Verify the module accepts 3.3 V logic.
constexpr bool RELAY_ACTIVE_LOW = false; // User: GPIO3 HIGH=ON, LOW=OFF.
constexpr uint8_t RELAY_ON_LEVEL = RELAY_ACTIVE_LOW ? LOW : HIGH;
constexpr uint8_t RELAY_OFF_LEVEL = RELAY_ACTIVE_LOW ? HIGH : LOW;

// Commanded output only; no contact feedback or state restored after a reboot.
static bool relayOn = false;

inline void setRelay(bool on) {
  digitalWrite(RELAY_PIN, on ? RELAY_ON_LEVEL : RELAY_OFF_LEVEL);
  relayOn = on;
}

inline void relayBegin() {
  // Preload the OFF level before enabling output (Arduino-ESP32 2.x/3.x).
  // Hardware must hold the relay inactive during reset, before this runs.
  gpio_set_level(static_cast<gpio_num_t>(RELAY_PIN), RELAY_OFF_LEVEL);
  pinMode(RELAY_PIN, RELAY_ACTIVE_LOW ? OUTPUT_OPEN_DRAIN : OUTPUT);
  setRelay(false);
}

inline void relayPrintStatus() {
  const int level = digitalRead(RELAY_PIN);
  Serial.printf("GPIO3 %s; relay %s berdasarkan GPIO; kontak tidak diukur.\n", level == HIGH ? "HIGH" : "LOW", level == RELAY_ON_LEVEL ? "ON" : "OFF");
}

inline void handleRelayCommand(const String& input) {
  String command = input;
  command.trim();
  command.toUpperCase();
  if (command == "RELAY ON") {
    setRelay(true);
    relayPrintStatus();
  } else if (command == "RELAY OFF") {
    setRelay(false);
    relayPrintStatus();
  } else if (command == "RELAY STATUS") {
    relayPrintStatus();
  } else if (command.startsWith("RELAY")) {
    Serial.println("Perintah: RELAY ON / RELAY OFF / RELAY STATUS.");
  }
}
