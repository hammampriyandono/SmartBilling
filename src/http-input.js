export class HttpError extends Error {
  constructor(status, code) { super(code); this.status = status; }
}
export function uuid(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new HttpError(400, 'invalid_uuid');
  }
  return value;
}
export function limit(value, fallback = 100) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^[1-9]\d{0,3}$/.test(value) || Number(value) > 1000) {
    throw new HttpError(400, 'limit_must_be_1_to_1000');
  }
  return Number(value);
}
export function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new HttpError(400, 'timestamp_requires_timezone');
  }
  const date = new Date(value);
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  if (!Number.isFinite(date.getTime()) || year < 2000 || month < 1 || month > 12 || day < 1
      || day > new Date(Date.UTC(year, month, 0)).getUTCDate()
      || Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59 || Number(value.slice(17, 19)) > 59) {
    throw new HttpError(400, 'invalid_timestamp');
  }
  return date.toISOString();
}
export function timeRange(query) {
  const from = timestamp(query.from);
  const to = timestamp(query.to);
  if (from >= to || Date.parse(to) - Date.parse(from) > 31 * 86400000) {
    throw new HttpError(400, 'range_must_be_positive_and_at_most_31_days');
  }
  return { from, to };
}
