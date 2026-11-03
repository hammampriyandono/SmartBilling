#pragma once
#include <Arduino.h>
#include <cstring>
struct Print {
  virtual ~Print()=default;
  virtual size_t write(uint8_t)=0;
  virtual size_t write(const uint8_t* bytes,size_t length){size_t sent=0;for(size_t i=0;i<length;i++)sent+=write(bytes[i]);return sent;}
  size_t print(const char* text){return write(reinterpret_cast<const uint8_t*>(text),std::strlen(text));}
  size_t println(const char* text){return print(text)+write(uint8_t('\n'));}
};
