#pragma once
#include <ArduinoJson.h>
#include <WiFi.h>
#include <time.h>
#include "relay_command_guard.h"
#include "relay_control.h"
extern "C" {
#include <lwmqtt/lwmqtt.h>
}
#ifndef RELAY_BINDING_ID
#define RELAY_BINDING_ID ""
#endif

// Separate transport over the same existing lwmqtt library. The native callback
// exposes QoS/retain, unlike the Arduino wrapper. Telemetry code is unchanged.
namespace RelayDashboard {
static_assert(RELAY_PIN==3,"Relay dashboard requires GPIO3.");
struct Timer {uint32_t start=0,timeout=0;};
struct Cached {char id[37]{},wire[512]{},report[640]{};};
static WiFiClient socket;
static lwmqtt_client_t client;
static uint8_t readBuffer[1024],writeBuffer[1024];
static Timer timer1,timer2;
static char bootId[37]{},commandTopic[160]{},statusTopic[160]{},clientId[100]{};
static bool (*ready)()=nullptr;
static uint64_t (*utcUs)()=nullptr;
static bool online=false,hasIncoming=false;
static char incoming[512]{};
static Cached cache[8];static size_t cacheNext=0;
static char reports[8][640]{};static size_t head=0,count=0;
static uint64_t highest=0;static uint32_t reportSequence=0,lastAttempt=0,lastHeartbeat=0;
static int previousLevel=-1;
inline void timerSet(void* ref,uint32_t timeout){auto* t=static_cast<Timer*>(ref);t->start=millis();t->timeout=timeout;}
inline int32_t timerGet(void* ref){auto* t=static_cast<Timer*>(ref);const uint32_t elapsed=millis()-t->start;return elapsed>=t->timeout?0:int32_t(t->timeout-elapsed);}
inline lwmqtt_err_t networkRead(void* ref,uint8_t* buffer,size_t length,size_t* received,uint32_t timeout){
  auto* stream=static_cast<WiFiClient*>(ref);*received=0;const uint32_t start=millis();
  while(*received<length&&uint32_t(millis()-start)<timeout){const int n=stream->read(buffer+*received,length-*received);
    if(n>0)*received+=size_t(n);else if(!stream->connected())return LWMQTT_NETWORK_FAILED_READ;else delay(1);}
  return *received?LWMQTT_SUCCESS:LWMQTT_NETWORK_TIMEOUT;
}
inline lwmqtt_err_t networkWrite(void* ref,uint8_t* buffer,size_t length,size_t* sent,uint32_t){
  *sent=static_cast<WiFiClient*>(ref)->write(buffer,length);return *sent==length?LWMQTT_SUCCESS:LWMQTT_NETWORK_FAILED_WRITE;
}
inline void receive(lwmqtt_client_t*,void*,lwmqtt_string_t topic,lwmqtt_message_t message){
  if(hasIncoming||message.retained||message.qos!=LWMQTT_QOS1||lwmqtt_strcmp(topic,commandTopic)||!message.payload||message.payload_len>=sizeof(incoming))return;
  // No GPIO or publish calls inside the MQTT callback.
  memcpy(incoming,message.payload,message.payload_len);incoming[message.payload_len]=0;
  if(strlen(incoming)!=message.payload_len)return;
  hasIncoming=true;
}
inline bool report(char* output,const char* commandId=nullptr,const char* commandSequence=nullptr,const char* result="status",const char* reason=nullptr){
  if(!ready||!ready()||reportSequence==UINT32_MAX)return false;
  const uint64_t microseconds=utcUs();if(microseconds<1704067200000000ULL)return false;
  const time_t seconds=microseconds/1000000;tm utc;gmtime_r(&seconds,&utc);char date[24],timestamp[32];
  strftime(date,sizeof(date),"%Y-%m-%dT%H:%M:%S",&utc);snprintf(timestamp,sizeof(timestamp),"%s.%03luZ",date,(unsigned long)(microseconds%1000000/1000));
  const int level=digitalRead(RELAY_PIN);JsonDocument value;
  value["schema_version"]=1;value["binding_id"]=RELAY_BINDING_ID;value["boot_id"]=bootId;
  value["report_sequence"]=++reportSequence;value["reported_at"]=timestamp;value["state"]=relayLevelIsOn(level)?"on":"off";
  value["gpio_pin"]=RELAY_PIN;value["gpio_level"]=level==HIGH?1:0;
  value["command_id"]=commandId;value["command_sequence"]=commandSequence;value["result"]=result;value["reason"]=reason;
  if(measureJson(value)>=640)return false;
  serializeJson(value,output,640);return true;
}
inline void enqueue(const char* wire){if(count==8)return;strlcpy(reports[(head+count)%8],wire,640);count++;}
inline void process(){
  if(!hasIncoming||count>=7)return;
  hasIncoming=false;char wire[512];strlcpy(wire,incoming,sizeof(wire));JsonDocument value;
  if(deserializeJson(value,wire)||!value.is<JsonObject>()||value.size()!=8)return;
  const char* id=value["command_id"],*binding=value["binding_id"],*boot=value["target_boot_id"],*sequence=value["sequence_no"],*state=value["desired_state"];
  const char* issued=value["issued_at"],*expires=value["expires_at"];
  uint64_t seq=0,start=0,end=0;
  if(!value["schema_version"].is<int>()||value["schema_version"].as<int>()!=1||!RelayGuard::uuid(id)||!RelayGuard::uuid(binding)||!RelayGuard::uuid(boot)
    ||!RelayGuard::sequence(sequence,seq)||!RelayGuard::timestamp(issued,start)||!RelayGuard::timestamp(expires,end)||!state||(strcmp(state,"on")&&strcmp(state,"off")))return;
  if(strcmp(binding,RELAY_BINDING_ID))return;
  for(const auto& old:cache)if(!strcmp(old.id,id)){
    if(!strcmp(old.wire,wire))enqueue(old.report);
    return;
  }
  const auto decision=RelayGuard::decide(binding,RELAY_BINDING_ID,boot,bootId,seq,highest,start,end,utcUs()/1000,ready());
  if(decision==RelayGuard::Decision::invalid)return;
  const char* reason=nullptr;
  if(decision==RelayGuard::Decision::wrongBoot)reason="wrong_boot";
  else if(decision==RelayGuard::Decision::expired)reason="expired";
  else if(decision==RelayGuard::Decision::superseded)reason="superseded";
  else{
    highest=seq;const bool on=!strcmp(state,"on");setRelay(on);
    if(relayReportedOn()!=on)reason="relay_unavailable";
    relayPrintStatus();
  }
  char result[640];if(!report(result,id,sequence,reason?"rejected":"applied",reason))return;
  auto& saved=cache[cacheNext];strlcpy(saved.id,id,sizeof(saved.id));strlcpy(saved.wire,wire,sizeof(saved.wire));strlcpy(saved.report,result,sizeof(saved.report));cacheNext=(cacheNext+1)%8;
  enqueue(result);previousLevel=digitalRead(RELAY_PIN);
}
inline void disconnect(){socket.stop();online=false;hasIncoming=false;}
inline void begin(const char* boot,bool (*clockReady)(),uint64_t (*utcNow)()){
  strlcpy(bootId,boot,sizeof(bootId));ready=clockReady;utcUs=utcNow;
  snprintf(commandTopic,sizeof(commandTopic),"smartbilling/v1/devices/%s/relay/commands",DEVICE_UID);
  snprintf(statusTopic,sizeof(statusTopic),"smartbilling/v1/devices/%s/relay/status",DEVICE_UID);
  snprintf(clientId,sizeof(clientId),"%s-relay",DEVICE_UID);
}
inline void tick(){
  if(!RelayGuard::uuid(RELAY_BINDING_ID)||!ready||!ready()||WiFi.status()!=WL_CONNECTED)return;
  if(online&&!socket.connected())disconnect();
  const uint32_t now=millis();
  if(!online){
    if(lastAttempt&&uint32_t(now-lastAttempt)<5000)return;lastAttempt=now;disconnect();
    if(!socket.connect(MQTT_HOST,MQTT_PORT,800))return;
    lwmqtt_init(&client,readBuffer,sizeof(readBuffer),writeBuffer,sizeof(writeBuffer));
    lwmqtt_set_network(&client,&socket,networkRead,networkWrite);lwmqtt_set_timers(&client,&timer1,&timer2,timerSet,timerGet);lwmqtt_set_callback(&client,nullptr,receive);
    lwmqtt_connect_options_t options=lwmqtt_default_connect_options;options.client_id=lwmqtt_string(clientId);options.keep_alive=20;
    options.username=lwmqtt_string(MQTT_USERNAME);options.password=lwmqtt_string(MQTT_PASSWORD);
    if(lwmqtt_connect(&client,&options,nullptr,600)!=LWMQTT_SUCCESS||lwmqtt_subscribe_one(&client,lwmqtt_string(commandTopic),LWMQTT_QOS1,600)!=LWMQTT_SUCCESS){disconnect();return;}
    online=true;lastHeartbeat=0;Serial.println("Relay dashboard MQTT terhubung; menunggu perintah owner.");return;
  }
  if(lwmqtt_keep_alive(&client,600)!=LWMQTT_SUCCESS){disconnect();return;}
  const int available=socket.available();
  if(available&&lwmqtt_yield(&client,size_t(available),100)!=LWMQTT_SUCCESS){disconnect();return;}
  process();const int level=digitalRead(RELAY_PIN);
  if(count<7&&(!lastHeartbeat||uint32_t(now-lastHeartbeat)>=10000||level!=previousLevel)){
    char wire[640];if(report(wire)){enqueue(wire);lastHeartbeat=now;previousLevel=level;}
  }
  if(count){
    lwmqtt_message_t message=lwmqtt_default_message;message.qos=LWMQTT_QOS1;message.payload=reinterpret_cast<uint8_t*>(reports[head]);message.payload_len=strlen(reports[head]);
    if(lwmqtt_publish(&client,nullptr,lwmqtt_string(statusTopic),message,600)==LWMQTT_SUCCESS){head=(head+1)%8;count--;}
    else disconnect();
  }
}
}
