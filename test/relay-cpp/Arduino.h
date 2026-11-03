#pragma once
#include <string>
#include <algorithm>
#include <cctype>
#include <cstdint>
#include <cstdio>
#include <vector>
constexpr int LOW=0,HIGH=1,OUTPUT=3,OUTPUT_OPEN_DRAIN=19;
inline int testLevel=-1,testMode=-1;inline std::vector<int> operations;
inline void digitalWrite(int pin,int level){if(pin!=3)throw "wrong pin";testLevel=level;operations.push_back(3);}
inline int digitalRead(int pin){if(pin!=3)throw "wrong pin";return testLevel;}
inline void pinMode(int pin,int mode){if(pin!=3)throw "wrong pin";testMode=mode;operations.push_back(2);}
class String {std::string text;public:String(const char* value):text(value){};void trim(){auto a=text.find_first_not_of(" \r\n\t");auto b=text.find_last_not_of(" \r\n\t");text=a==std::string::npos?"":text.substr(a,b-a+1);}void toUpperCase(){for(char& c:text)c=std::toupper(static_cast<unsigned char>(c));}bool operator==(const char* v)const{return text==v;}bool startsWith(const char* v)const{return text.rfind(v,0)==0;}};
struct TestSerial {std::string text;bool attached=true;int room=256,rx=0,writes=0,reads=0;unsigned long baud=0;uint32_t timeout=0;
  void begin(unsigned long value){baud=value;}void setTxTimeoutMs(uint32_t value){timeout=value;}explicit operator bool(){return attached;}
  int availableForWrite(){return room;}int available(){return rx;}int read(){reads++;return 65;}
  size_t write(const uint8_t* bytes,size_t length){writes++;if(int(length)>room)throw "would block";room-=int(length);text.append(reinterpret_cast<const char*>(bytes),length);return length;}
  template<class...Args>void printf(const char* format,Args...args){char buffer[256];std::snprintf(buffer,sizeof(buffer),format,args...);text=buffer;}void println(const char* value){text=value;}};
inline TestSerial Serial;
