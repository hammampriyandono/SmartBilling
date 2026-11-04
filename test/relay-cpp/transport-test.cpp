#include <cassert>
#include <iostream>
#define MQTT_CA_CERT "fixture-trusted-ca"
#include "mqtt_transport.h"
int main(){
  MqttTransport telemetry,relay;configureMqttTransport(telemetry);configureMqttTransport(relay);
#if MQTT_USE_TLS
  assert(telemetry.ca&&relay.ca);assert(telemetry.ca==relay.ca);
  assert(telemetry.connectionTimeout==2000&&relay.connectionTimeout==2000);
  assert(telemetry.handshakeTimeout==2&&relay.handshakeTimeout==2);
  assert(!mqttTransportReady(false)&&mqttTransportReady(true));
  assert(MQTT_NETWORK_GUARD_US==12000000ULL);
#else
  assert(mqttTransportReady(false)&&mqttTransportReady(true));
  assert(MQTT_NETWORK_GUARD_US==4000000ULL);
#endif
  std::cout<<"PASS: both MQTT transports configured, clock gate and bounded TLS handshake; mode="<<MQTT_USE_TLS<<". No network/device access.\n";
}
