#pragma once
#include <WiFi.h>
#ifndef MQTT_USE_TLS
#define MQTT_USE_TLS 0
#endif
#if MQTT_USE_TLS
#include <WiFiClientSecure.h>
#ifndef MQTT_CA_CERT
#error "MQTT_CA_CERT is required for verified MQTT TLS."
#endif
static_assert(sizeof(MQTT_CA_CERT)>1,"MQTT TLS CA must not be empty.");
using MqttTransport=WiFiClientSecure;
constexpr uint64_t MQTT_NETWORK_GUARD_US=12000000ULL;
inline void configureMqttTransport(MqttTransport& client){
  client.setCACert(MQTT_CA_CERT);
  client.setConnectionTimeout(2000);
  client.setHandshakeTimeout(2);
}
inline bool mqttTransportReady(bool clockReady){return clockReady;}
#else
using MqttTransport=WiFiClient;
constexpr uint64_t MQTT_NETWORK_GUARD_US=4000000ULL;
inline void configureMqttTransport(MqttTransport&){}
inline bool mqttTransportReady(bool){return true;}
#endif
