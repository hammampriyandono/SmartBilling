function units(value) {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 1000000000n + BigInt(fraction.padEnd(9, '0'));
}
function decimal(value) {
  return `${value / 1000000000n}.${String(value % 1000000000n).padStart(9, '0')}`;
}

// Input rows sorted by measured_at, id; includes one preceding sample for reset context.
export function dailyConsumption(days, rows, maxGapSeconds) {
  const badEpochs = new Set();
  const previousEnergy = new Map();
  const timestampCounts = new Map();
  for (const row of rows) {
    const time = new Date(row.measured_at).getTime();
    timestampCounts.set(time, (timestampCounts.get(time) || 0) + 1);
    const energy = units(row.energy_kwh);
    const previous = previousEnergy.get(row.counter_epoch);
    if (previous !== undefined && energy < previous) badEpochs.add(row.counter_epoch);
    previousEnergy.set(row.counter_epoch, energy);
  }
  return days.map((day) => {
    const start = new Date(day.starts_at).getTime();
    const end = new Date(day.ends_at).getTime();
    const samples = rows.filter((row) => {
      const time = new Date(row.measured_at).getTime();
      return time >= start && time <= end;
    });
    const reasons = new Set();
    if (!samples.length) reasons.add('no_data');
    if (!samples.length || new Date(samples[0].measured_at).getTime() !== start) reasons.add('missing_start_boundary');
    if (!samples.length || new Date(samples.at(-1).measured_at).getTime() !== end) reasons.add('missing_end_boundary');
    let sum = 0n, coveredSeconds = 0, validIntervals = 0;
    for (let i = 0; i < samples.length; i++) {
      const current = samples[i];
      if (current.quality !== 'valid') reasons.add('invalid_quality');
      if (badEpochs.has(current.counter_epoch)) reasons.add('counter_decreased');
      const currentTime = new Date(current.measured_at).getTime();
      if (timestampCounts.get(currentTime) > 1) reasons.add('ambiguous_timestamp');
      if (!i) continue;
      const previous = samples[i - 1];
      const previousTime = new Date(previous.measured_at).getTime();
      const seconds = (currentTime - previousTime) / 1000;
      const reset = current.counter_epoch !== previous.counter_epoch;
      if (reset) reasons.add('counter_reset');
      if (seconds > maxGapSeconds) reasons.add('gap');
      if (seconds <= 0 || seconds > maxGapSeconds || reset
          || current.quality !== 'valid' || previous.quality !== 'valid'
          || badEpochs.has(current.counter_epoch)
          || timestampCounts.get(currentTime) > 1 || timestampCounts.get(previousTime) > 1) continue;
      sum += units(current.energy_kwh) - units(previous.energy_kwh);
      coveredSeconds += seconds;
      validIntervals++;
    }
    const complete = reasons.size === 0 && coveredSeconds === (end - start) / 1000;
    return {
      date: day.date, starts_at: day.starts_at, ends_at: day.ends_at,
      status: complete ? 'complete' : samples.length ? 'partial' : 'no_data',
      consumption_kwh: complete ? decimal(sum) : null,
      observed_consumption_kwh: validIntervals ? decimal(sum) : null,
      coverage_seconds: coveredSeconds, expected_seconds: (end - start) / 1000,
      sample_count: samples.length, reasons: [...reasons],
    };
  });
}
