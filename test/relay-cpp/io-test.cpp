#include <cassert>
#include <iostream>
#include <Arduino.h>
auto& rawSerial=Serial;
#include "diagnostic_serial.h"
#include "pzem_request.h"
int main(){
  Serial.begin(115200);assert(rawSerial.baud==115200&&rawSerial.timeout==2);
  rawSerial.attached=false;Serial.println("No USB host");assert(rawSerial.writes==0&&Serial.available()==0&&Serial.read()==-1);
  rawSerial.attached=true;rawSerial.room=0;Serial.println("Full TX buffer");assert(rawSerial.writes==0);
  rawSerial.room=3;assert(Serial.print("abcdef")==6);assert(rawSerial.text=="abc"&&rawSerial.writes==1);
  rawSerial.rx=-1;assert(Serial.available()==0&&Serial.read()==-1&&rawSerial.reads==0);
  rawSerial.rx=1;assert(Serial.available()==1&&Serial.read()==65&&rawSerial.reads==1);
  struct Port {int availableCount=0,readCount=0,writeCount=0;bool noise=false,shortWrite=false;int available(){return noise?1:availableCount;}int read(){readCount++;availableCount--;return 0;}size_t write(const uint8_t*,size_t size){writeCount++;return shortWrite?size-1:size;}};
  const uint8_t request[8]={0xf8,4,0,0,0,10,0,0};
  unsigned clock=0,waitCount=0;Port good;good.availableCount=3;
  assert(PzemRequest::send(good,request,sizeof(request),[&](uint32_t limit){assert(limit==100);waitCount++;return true;},[&](){return clock++;}));
  assert(good.readCount==3&&good.writeCount==1&&waitCount==2);
  Port stalled;waitCount=0;
  assert(!PzemRequest::send(stalled,request,sizeof(request),[&](uint32_t limit){assert(limit==100);waitCount++;return false;},[](){return 0U;}));
  assert(stalled.writeCount==0&&waitCount==1);
  Port postStall;waitCount=0;
  assert(!PzemRequest::send(postStall,request,sizeof(request),[&](uint32_t){return ++waitCount==1;},[](){return 0U;}));
  assert(postStall.writeCount==1&&waitCount==2);
  Port noisy;noisy.noise=true;
  assert(PzemRequest::send(noisy,request,sizeof(request),[](uint32_t){return true;},[](){return 0U;}));assert(noisy.readCount==256);
  Port continuous;continuous.noise=true;clock=0;
  assert(PzemRequest::send(continuous,request,sizeof(request),[](uint32_t){return true;},[&](){return clock++;}));assert(continuous.readCount<=5);
  Port unavailable;unavailable.availableCount=-1;
  assert(PzemRequest::send(unavailable,request,sizeof(request),[](uint32_t){return true;},[](){return 0U;}));assert(unavailable.readCount==0);
  Port incomplete;incomplete.shortWrite=true;
  assert(!PzemRequest::send(incomplete,request,sizeof(request),[](uint32_t){return true;},[](){return 0U;}));
  std::cout<<"PASS: actual I/O guards drop absent/full USB output, normalize negative RX, bound UART drain and TX waits.\n";
}
