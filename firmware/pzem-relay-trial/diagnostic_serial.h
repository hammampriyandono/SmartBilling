#pragma once
#include <Arduino.h>
#include <Print.h>

// Debug output is best-effort. A missing/slow USB host must never hold the
// sensor/relay loop. Keep Serial Monitor input, normalize unavailable RX to 0.
template<class Device> class NonBlockingDiagnosticSerial : public Print {
  Device& device;
 public:
  explicit NonBlockingDiagnosticSerial(Device& value):device(value){}
  void begin(unsigned long baud){device.begin(baud);device.setTxTimeoutMs(2);}
  using Print::write;
  size_t write(uint8_t value) override{return write(&value,1);}
  size_t write(const uint8_t* data,size_t length) override{
    if(!length||!data)return 0;
    if(!bool(device))return length;
    const int room=device.availableForWrite();
    if(room>0){const size_t bytes=length<size_t(room)?length:size_t(room);device.write(data,bytes);}
    return length; // Drop diagnostics that do not fit; never retry/block.
  }
  int available(){if(!bool(device))return 0;const int count=device.available();return count>0?count:0;}
  int read(){return available()>0?device.read():-1;}
  explicit operator bool(){return bool(device);}
};

static NonBlockingDiagnosticSerial<decltype(Serial)> SmartBillingSerial(Serial);
#undef Serial
#define Serial SmartBillingSerial
