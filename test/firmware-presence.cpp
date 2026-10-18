#include <cassert>
#include <initializer_list>
#include "../firmware/rfid-integration/presence_gate.h"
#include "../firmware/rfid-integration/reply_policy.h"
int main(){
 PresenceGate gate;
 assert(!gate.present()); // Boot with card held must not emit.
 gate.timeout();gate.timeout();assert(!gate.present()); // Incomplete removal.
 gate.timeout();gate.error();gate.timeout();gate.timeout();assert(!gate.present());
 gate.timeout();gate.timeout();gate.timeout();assert(gate.present()); // One tap after removal.
 for(int i=0;i<100;i++)assert(!gate.present()); // Held card: no local open/close loop.
 gate.timeout();gate.timeout();gate.timeout();assert(gate.present()); // Next physical tap.
 PresenceGate restarted;assert(!restarted.present()); // Crash still requires release.
 assert(replyDecision(false,"processed",true,"opened")==ReplyDecision::Ignore);
 assert(replyDecision(true,"pending",false,"")==ReplyDecision::Ignore);
 assert(replyDecision(true,"processed",true,"opened")==ReplyDecision::Commit);
 assert(replyDecision(true,"processed",true,"closed")==ReplyDecision::Commit);
 assert(replyDecision(true,"rejected",true,"")==ReplyDecision::Commit);
 for(const char *status:{"conflict","review","rejected","processed"})
  assert(replyDecision(true,status,false,"")==ReplyDecision::Halt);
 assert(replyDecision(true,"processed",true,"OK")==ReplyDecision::Halt);
}
