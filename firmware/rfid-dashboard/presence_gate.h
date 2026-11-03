#pragma once
#include <stdint.h>
// Only confirmed RF timeout counts as removal. Poll spacing is supplied by loop.
// Communication error/collision is never removal; restart starts disarmed.
struct PresenceGate {
 bool armed=false;
 uint8_t absent=0;
 void timeout(){if(absent<3)++absent;if(absent==3)armed=true;}
 void error(){armed=false;absent=0;}
 bool present(){const bool tap=armed;armed=false;absent=0;return tap;}
};
