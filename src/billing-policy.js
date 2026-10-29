export const defaultCalculationPolicy = Object.freeze({
  production_max_gap_seconds: 180,
  boundary_method: 'inside',
  boundary_tolerance_seconds: 60,
});

export function calculationPolicy(input = defaultCalculationPolicy) {
  const keys = Object.keys(defaultCalculationPolicy);
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some(key => !keys.includes(key))) throw new Error('invalid_calculation_policy');
  const gap = input.production_max_gap_seconds;
  const tolerance = input.boundary_tolerance_seconds;
  if (!Number.isInteger(gap) || gap < 1 || gap > 3600
    || !['exact', 'inside'].includes(input.boundary_method)
    || !Number.isInteger(tolerance) || tolerance < 0 || tolerance > Math.min(300, gap)
    || (input.boundary_method === 'exact' && tolerance !== 0)) throw new Error('invalid_calculation_policy');
  return Object.fromEntries(keys.map(key => [key, input[key]]));
}

export function previewTariff(input) {
  if (input == null) return null;
  if (typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some(key => !['energy_rate_rp_kwh', 'source_reference'].includes(key))
    || typeof input.energy_rate_rp_kwh !== 'string'
    || !/^\d{1,12}(\.\d{1,12})?$/.test(input.energy_rate_rp_kwh)
    || Number(input.energy_rate_rp_kwh) <= 0
    || typeof input.source_reference !== 'string' || !input.source_reference.trim()
    || input.source_reference.length > 240) throw new Error('invalid_preview_tariff');
  return {energy_rate_rp_kwh: input.energy_rate_rp_kwh, source_reference: input.source_reference.trim()};
}
