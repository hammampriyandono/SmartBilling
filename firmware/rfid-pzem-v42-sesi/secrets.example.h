#pragma once
// Private per-device credentials belong in ignored secrets.h, never in Git.
#define WIFI_SSID "<WIFI_SSID>"
#define WIFI_PASSWORD "<WIFI_PASSWORD>"
// Optional second private network; empty keeps the original single-network flow.
#define WIFI_FALLBACK_SSID ""
#define WIFI_FALLBACK_PASSWORD ""
#define MQTT_HOST "<LAPTOP_LAN_IPV4>"
#define MQTT_PORT 1884
#define DEVICE_UID "<REGISTERED_RFID_DEVICE_UID>"
#define EXPECTED_MAC_HEX "<ESP32_MAC_12_LOWERCASE_HEX>"
#define MQTT_USERNAME DEVICE_UID
#define MQTT_PASSWORD "<DEVICE_BROKER_PASSWORD>"
#define READER_CHANNEL 0
#define NTP_SERVER "pool.ntp.org"
