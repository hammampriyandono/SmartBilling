#pragma once
// Copy locally to secrets.h; never commit that file. No actual credentials here.
#define WIFI_SSID "<WIFI_SSID>"
#define WIFI_PASSWORD "<WIFI_PASSWORD>"
#define MQTT_HOST "<LAN_BROKER_IP>"
#define MQTT_PORT 1883
// LAN test ACL uses username equal to registered device UID (no spaces/slashes).
#define DEVICE_UID "<REGISTERED_DEVICE_UID>"
#define MQTT_USERNAME DEVICE_UID
#define MQTT_PASSWORD "<DEVICE_BROKER_PASSWORD>"
#define READER_CHANNEL 0
#define NTP_SERVER "pool.ntp.org"
// For isolated authenticated LAN tests only: TCP MQTT is NOT encrypted.
// TLS/certificate provisioning required before Internet deployment.
