#pragma once
#include <stdint.h>
#include <stddef.h>
struct PzemFrame { uint16_t voltage10, frequency10, pf100; uint32_t current1000, power10, energyWh; };
inline uint16_t pzemCrc(const uint8_t* bytes,size_t length){uint16_t crc=0xffff;for(size_t i=0;i<length;i++){crc^=bytes[i];for(int bit=0;bit<8;bit++)crc=(crc&1)?(crc>>1)^0xa001:crc>>1;}return crc;}
inline uint16_t pzem16(const uint8_t* b,int at){return (uint16_t(b[at])<<8)|b[at+1];}
inline uint32_t pzem32(const uint8_t* b,int at){return uint32_t(pzem16(b,at))|(uint32_t(pzem16(b,at+2))<<16);}
inline bool decodePzem(const uint8_t* b,size_t length,PzemFrame& data){
 if(length!=25||b[0]!=0xf8||b[1]!=4||b[2]!=20||pzemCrc(b,23)!=(uint16_t(b[23])|(uint16_t(b[24])<<8)))return false;
 data={pzem16(b,3),pzem16(b,17),pzem16(b,19),pzem32(b,5),pzem32(b,9),pzem32(b,13)};
 return data.pf100<=100;
}
