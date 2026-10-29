import {parseDecimal, formatDecimal} from './billing-calculation.js';

// Rows must be ordered by measured_at, id. Never borrow outside the requested window.
export function evaluateReadings(input, start, end, policy = {}) {
  const from = +new Date(start), to = +new Date(end);
  const rows = input.filter(row => +new Date(row.measured_at) >= from && +new Date(row.measured_at) <= to);
  const first = rows[0], last = rows.at(-1);
  const inside = policy.boundary_method === 'inside';
  const tolerance = inside ? (policy.boundary_tolerance_seconds ?? 0) : 0;
  const startOffset = first ? (+new Date(first.measured_at) - from) / 1000 : null;
  const endOffset = last ? (to - new Date(last.measured_at)) / 1000 : null;
  const evidence = {
    sample_count: rows.length, boundary_method: inside ? 'inside' : 'exact',
    max_gap_seconds: policy.production_max_gap_seconds ?? null, boundary_tolerance_seconds: tolerance,
    requested_starts_at: new Date(start).toISOString(), requested_ends_at: new Date(end).toISOString(),
    measured_starts_at: first ? new Date(first.measured_at).toISOString() : null,
    measured_ends_at: last ? new Date(last.measured_at).toISOString() : null,
    start_offset_seconds: startOffset, end_offset_seconds: endOffset,
  };
  let reason = !rows.length ? 'no_data' : startOffset > tolerance ? 'missing_start_boundary'
    : endOffset > tolerance ? 'missing_end_boundary' : rows.length < 2 ? 'insufficient_samples' : null;
  if (!reason) for (let i = 0; i < rows.length; i++) {
    const row = rows[i], prior = rows[i - 1];
    if (row.quality !== 'valid' || row.energy_kwh == null) { reason = 'invalid_quality'; break; }
    if (!prior) continue;
    const seconds = (+new Date(row.measured_at) - new Date(prior.measured_at)) / 1000;
    if (seconds <= 0) { reason = 'ambiguous_timestamp'; break; }
    if (row.counter_epoch !== prior.counter_epoch) { reason = 'counter_reset'; break; }
    if (parseDecimal(row.energy_kwh, 9) < parseDecimal(prior.energy_kwh, 9)) { reason = 'counter_decreased'; break; }
    if (policy.production_max_gap_seconds == null) { reason = 'gap_policy_unset'; break; }
    if (seconds > policy.production_max_gap_seconds) { reason = 'gap'; break; }
  }
  return {
    status: reason ? 'review' : 'valid', reason,
    energy_kwh: reason ? null : formatDecimal(parseDecimal(last.energy_kwh, 9) - parseDecimal(first.energy_kwh, 9), 9),
    start_reading_id: first?.id ?? null, end_reading_id: last?.id ?? null,
    start_energy_kwh: first?.energy_kwh ?? null, end_energy_kwh: last?.energy_kwh ?? null,
    sample_count: rows.length, evidence,
  };
}
