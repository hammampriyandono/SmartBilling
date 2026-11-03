#include <cassert>
#include <cstdint>
#include "../firmware/pzem-dashboard/utc_sampling.h"
int main(){
 const uint64_t minute=60000000ULL,base=30000000ULL*minute;
 uint64_t slot=0;
 UtcSampling a(minute,1000000),b(minute,1000000);
 assert(a.poll(base+15000000,0,slot)==SamplingTick::waiting);
 assert(b.poll(base+47000000,0,slot)==SamplingTick::waiting);
 assert(a.poll(base+minute-1,0,slot)==SamplingTick::waiting);
 assert(!a.networkWindow(base+minute-3000000,4000000));
 assert(a.poll(base+minute+50000,0,slot)==SamplingTick::due&&slot==base+minute);
 assert(b.poll(base+minute+170000,0,slot)==SamplingTick::due&&slot==base+minute);
 assert(a.poll(base+minute+500000,0,slot)==SamplingTick::waiting);
 assert(a.poll(base+2*minute+1000001,0,slot)==SamplingTick::missed);
 assert(a.poll(base+3*minute+1,0,slot)==SamplingTick::due&&slot==base+3*minute);
 assert(a.poll(base+7*minute+10,0,slot)==SamplingTick::due&&slot==base+7*minute);
 assert(a.poll(base+4*minute,0,slot)==SamplingTick::waiting);
 assert(a.poll(base+8*minute,0,slot)==SamplingTick::due);
 UtcSampling reboot(minute,1000000);
 assert(reboot.poll(base+10*minute,base+10*minute+100000,slot)==SamplingTick::waiting);
 assert(reboot.poll(base+11*minute,base+10*minute+100000,slot)==SamplingTick::due);
 UtcSampling future(minute,1000000);
 assert(future.poll(base,base+20*minute,slot)==SamplingTick::waiting);
 assert(future.poll(base+20*minute,base+20*minute,slot)==SamplingTick::waiting);
 assert(future.poll(base+21*minute,base+20*minute,slot)==SamplingTick::due);
 UtcSampling exactBoot(minute,1000000);
 assert(exactBoot.poll(base,0,slot)==SamplingTick::waiting);
 assert(exactBoot.poll(base+minute+1000000,0,slot)==SamplingTick::due);
 return 0;
}
