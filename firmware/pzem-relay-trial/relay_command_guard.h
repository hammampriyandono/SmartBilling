#pragma once
#include <stdint.h>
#include <stddef.h>
#include <string.h>

namespace RelayGuard {
inline bool uuid(const char* value) {
  if (!value || strlen(value)!=36) return false;
  for (size_t i=0;i<36;i++) {
    if (i==8||i==13||i==18||i==23) { if(value[i]!='-')return false; }
    else if (!((value[i]>='0'&&value[i]<='9')||(value[i]>='a'&&value[i]<='f'))) return false;
  }
  return true;
}
inline bool sequence(const char* text,uint64_t& value) {
  if(!text||!*text||text[0]=='0'||strlen(text)>19)return false;
  value=0;
  for(const char* p=text;*p;p++) {
    if(*p<'0'||*p>'9')return false;
    const unsigned digit=*p-'0';
    if(value>(uint64_t(INT64_MAX)-digit)/10)return false;
    value=value*10+digit;
  }
  return true;
}
// Exact backend UTC wire format. Civil-date conversion is independent of TZ.
inline bool timestamp(const char* s,uint64_t& milliseconds) {
  if(!s||strlen(s)!=24||s[4]!='-'||s[7]!='-'||s[10]!='T'||s[13]!=':'||s[16]!=':'||s[19]!='.'||s[23]!='Z')return false;
  for(size_t i=0;i<24;i++)if(i!=4&&i!=7&&i!=10&&i!=13&&i!=16&&i!=19&&i!=23&&(s[i]<'0'||s[i]>'9'))return false;
  const int year=(s[0]-'0')*1000+(s[1]-'0')*100+(s[2]-'0')*10+s[3]-'0';
  const int month=(s[5]-'0')*10+s[6]-'0',day=(s[8]-'0')*10+s[9]-'0';
  const int hour=(s[11]-'0')*10+s[12]-'0',minute=(s[14]-'0')*10+s[15]-'0',second=(s[17]-'0')*10+s[18]-'0';
  const int fraction=(s[20]-'0')*100+(s[21]-'0')*10+s[22]-'0';
  const bool leap=year%4==0&&(year%100!=0||year%400==0);
  const int days[]={31,leap?29:28,31,30,31,30,31,31,30,31,30,31};
  if(year<2000||year>2199||month<1||month>12||day<1||day>days[month-1]||hour>23||minute>59||second>59)return false;
  const int y=year-(month<=2),era=y/400,yoe=y-era*400,mp=month+(month>2?-3:9);
  const int64_t epochDays=int64_t(era)*146097+(yoe*365+yoe/4-yoe/100)+(153*mp+2)/5+day-1-719468;
  milliseconds=uint64_t(epochDays)*86400000ULL+uint64_t(hour)*3600000ULL+uint64_t(minute)*60000ULL+uint64_t(second)*1000+fraction;
  return true;
}
enum class Decision { apply, invalid, wrongBoot, expired, superseded };
inline Decision decide(const char* binding,const char* expectedBinding,const char* boot,const char* expectedBoot,
  uint64_t seq,uint64_t highest,uint64_t issued,uint64_t expires,uint64_t now,bool clockReady) {
  if(!clockReady||!uuid(binding)||!uuid(boot)||strcmp(binding,expectedBinding)||!seq||seq>uint64_t(INT64_MAX)
    ||expires<=issued||expires-issued>15000||issued>now+5000)return Decision::invalid;
  if(strcmp(boot,expectedBoot))return Decision::wrongBoot;
  if(now>=expires)return Decision::expired;
  if(seq<=highest)return Decision::superseded;
  return Decision::apply;
}
}
