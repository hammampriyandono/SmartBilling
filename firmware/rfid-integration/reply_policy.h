#pragma once
#include <cstring>
enum class ReplyDecision {Ignore,Commit,Halt};
inline ReplyDecision replyDecision(bool correlated,const char *status,bool consumed,const char *action){
 if(!correlated||std::strcmp(status,"pending")==0)return ReplyDecision::Ignore;
 if(consumed&&(std::strcmp(status,"rejected")==0||
   (std::strcmp(status,"processed")==0&&(std::strcmp(action,"opened")==0||std::strcmp(action,"closed")==0))))return ReplyDecision::Commit;
 return ReplyDecision::Halt;
}
