#include <cassert>
#include <iostream>
#include "relay_control.h"
#include "relay_command_guard.h"
int main(){
  relayBegin();assert(testLevel==LOW&&!relayOn&&testMode==OUTPUT);assert(operations[0]==1&&operations[1]==2&&operations[2]==3);
  handleRelayCommand(String(" relay on "));assert(testLevel==HIGH&&relayOn);assert(Serial.text.find("GPIO3 HIGH; relay ON")!=std::string::npos);
  testLevel=LOW;relayPrintStatus();assert(relayOn&&Serial.text.find("GPIO3 LOW; relay OFF")!=std::string::npos);
  handleRelayCommand(String("RELAY OFF"));assert(testLevel==LOW&&!relayOn);
  handleRelayCommand(String("UNKNOWN"));assert(testLevel==LOW);
  uint64_t now=0,seq=0;assert(RelayGuard::timestamp("2026-11-02T02:00:00.000Z",now));assert(now==1793584800000ULL);
  assert(RelayGuard::timestamp("2024-02-29T00:00:00.000Z",seq));assert(seq==1709164800000ULL);
  for(const char* value:{"2026-02-29T00:00:00.000Z","2026-11-02T24:00:00.000Z","2026-11-02T02:00:60.000Z","2026-11-02T02:00:00Z","2026-11-02T02:00:00.000+07:00"})assert(!RelayGuard::timestamp(value,seq));
  assert(RelayGuard::sequence("9223372036854775807",seq)&&seq==uint64_t(INT64_MAX));
  for(const char* value:{"0","01","-1","1.0","9223372036854775808","18446744073709551615"})assert(!RelayGuard::sequence(value,seq));
  const char* binding="11111111-1111-4111-8111-111111111111",*boot="22222222-2222-4222-8222-222222222222",*other="33333333-3333-4333-8333-333333333333";
  using D=RelayGuard::Decision;
  auto decide=[&](const char* b,const char* bt,uint64_t sequence,uint64_t highest,uint64_t issued,uint64_t expires,bool ready=true){return RelayGuard::decide(b,binding,bt,boot,sequence,highest,issued,expires,now,ready);};
  assert(decide(binding,boot,2,1,now,now+15000)==D::apply);
  assert(decide(binding,boot,2,1,now,now+15000,false)==D::invalid);
  assert(decide(other,boot,2,1,now,now+15000)==D::invalid);
  assert(decide(binding,other,2,1,now,now+15000)==D::wrongBoot);
  assert(decide(binding,boot,2,1,now-15000,now)==D::expired);
  assert(decide(binding,boot,1,1,now,now+15000)==D::superseded);
  assert(decide(binding,boot,2,1,now,now+15001)==D::invalid);
  assert(decide(binding,boot,2,1,now+5001,now+15000)==D::invalid);
  assert(decide(binding,boot,2,1,now,now)==D::invalid);
  std::cout<<"PASS: actual relay header HIGH/ON LOW/OFF, startup ordering, GPIO readback; UTC/sequence/boot/TTL guards. No hardware actuated.\n";
}
