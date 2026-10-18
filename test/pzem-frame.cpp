// Synthetic parser fixture only; never published to MQTT or inserted into DB.
#include "../firmware/pzem-dashboard/pzem_frame.h"
#include <cassert>
#include <cstring>
#include <iostream>
static void word(uint8_t* b,int at,uint16_t value){b[at]=uint8_t(value>>8);b[at+1]=uint8_t(value);}
static void wide(uint8_t* b,int at,uint32_t value){word(b,at,uint16_t(value));word(b,at+2,uint16_t(value>>16));}
static void crc(uint8_t* b){const uint16_t c=pzemCrc(b,23);b[23]=uint8_t(c);b[24]=uint8_t(c>>8);}
int main(){
 const uint8_t request[]={0xf8,4,0,0,0,10};assert(pzemCrc(request,sizeof(request))==0x6464);
 uint8_t b[25]{};b[0]=0xf8;b[1]=4;b[2]=20;word(b,3,2201);wide(b,5,1234);wide(b,9,1357);wide(b,13,4294967295U);word(b,17,500);word(b,19,95);crc(b);
 PzemFrame data{};assert(decodePzem(b,sizeof(b),data));assert(data.voltage10==2201);assert(data.current1000==1234);assert(data.power10==1357);assert(data.energyWh==4294967295U);assert(data.frequency10==500);assert(data.pf100==95);
 assert(!decodePzem(b,24,data));b[5]^=1;assert(!decodePzem(b,sizeof(b),data));b[5]^=1;
 b[0]=1;crc(b);assert(!decodePzem(b,sizeof(b),data));b[0]=0xf8;word(b,19,101);crc(b);assert(!decodePzem(b,sizeof(b),data));
 std::cout<<"PASS: CRC, address, frame length, low/high word order, full uint32 Wh, invalid PF. No sensor data generated.\n";
}
