#pragma once
#include <Arduino.h>
using gpio_num_t=int;
inline void gpio_set_level(gpio_num_t pin,int level){if(pin!=3)throw "wrong pin";testLevel=level;operations.push_back(1);}
