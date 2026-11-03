#pragma once
#include <stdint.h>

enum class SamplingTick { waiting, due, missed };

// Absolute UTC boundaries, independent of boot time. Never backfill or repeat a
// slot after a slow loop, a forward clock step, or a backward NTP correction.
class UtcSampling {
 public:
  UtcSampling(uint64_t intervalUs, uint64_t maxStartDelayUs)
      : interval(intervalUs), maxDelay(maxStartDelayUs) {}

  SamplingTick poll(uint64_t nowUs, uint64_t lastMeasuredUs, uint64_t& slotUs) {
    if (!interval) return SamplingTick::waiting;
    if (!next) {
      const uint64_t anchor = nowUs > lastMeasuredUs ? nowUs : lastMeasuredUs;
      next = (anchor / interval + 1) * interval;
      return SamplingTick::waiting;
    }
    if (nowUs < next) return SamplingTick::waiting;
    slotUs = nowUs / interval * interval;
    next = slotUs + interval;
    if (slotUs <= lastMeasuredUs || nowUs - slotUs > maxDelay) return SamplingTick::missed;
    return SamplingTick::due;
  }

  bool networkWindow(uint64_t nowUs, uint64_t guardUs) const {
    return !next || (nowUs < next && next - nowUs > guardUs);
  }

 private:
  const uint64_t interval, maxDelay;
  uint64_t next = 0;
};
