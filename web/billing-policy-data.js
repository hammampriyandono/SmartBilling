import {calculationPolicy, defaultCalculationPolicy, previewTariff} from '../src/billing-policy.js';

export function policyFormValues(period) {
  const policy = period?.policy_snapshot || defaultCalculationPolicy;
  return {
    production_max_gap_seconds: policy.production_max_gap_seconds ?? defaultCalculationPolicy.production_max_gap_seconds,
    boundary_method: policy.boundary_method || (period ? 'exact' : 'inside'),
    boundary_tolerance_seconds: policy.boundary_tolerance_seconds ?? (period ? 0 : defaultCalculationPolicy.boundary_tolerance_seconds),
    use_preview: Boolean(policy.preview_tariff),
    rate: policy.preview_tariff?.energy_rate_rp_kwh || '',
    reference: policy.preview_tariff?.source_reference || '',
  };
}

export function policyFormBody(values) {
  return {
    calculation_policy: calculationPolicy({
      production_max_gap_seconds: Number(values.production_max_gap_seconds),
      boundary_method: values.boundary_method,
      boundary_tolerance_seconds: values.boundary_method === 'exact' ? 0 : Number(values.boundary_tolerance_seconds),
    }),
    preview_tariff: values.use_preview ? previewTariff({energy_rate_rp_kwh: values.rate, source_reference: values.reference}) : null,
  };
}
