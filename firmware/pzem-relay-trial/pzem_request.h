#pragma once
#include <stddef.h>
#include <stdint.h>

namespace PzemRequest {
// Wait is the ESP-IDF uart_wait_tx_done adapter, with a finite deadline.
// Drain cannot spin forever on a noisy or unavailable UART.
template<class Port,class Wait,class Clock>
bool send(Port& port,const uint8_t* bytes,size_t length,Wait wait,Clock clock){
  if(!wait(100))return false;
  const uint32_t started=clock();size_t discarded=0;
  while(port.available()>0&&discarded<256&&uint32_t(clock()-started)<5){port.read();discarded++;}
  if(port.write(bytes,length)!=length)return false;
  return wait(100);
}
}
