#pragma once
#include "WiFi.h"
struct WiFiClientSecure:WiFiClient {
  const char* ca=nullptr;uint32_t connectionTimeout=0,handshakeTimeout=0;
  void setCACert(const char* value){ca=value;}
  void setConnectionTimeout(uint32_t value){connectionTimeout=value;}
  void setHandshakeTimeout(unsigned long value){handshakeTimeout=value;}
};
