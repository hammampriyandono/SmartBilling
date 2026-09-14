export async function getJson(path, signal) {
  let response;
  try { response = await fetch(path, { signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]), cache: 'no-store' }); }
  catch (error) {
    if (signal.aborted) throw error;
    throw new Error(error.name === 'TimeoutError' ? 'Waktu tunggu habis. Coba lagi.' : 'Tidak dapat menghubungi backend. Periksa layanan lokal.');
  }
  if (!response.ok) throw new Error(response.status === 422 ? 'Data terlalu banyak. Perpendek rentang tanggal.' : `Permintaan gagal (HTTP ${response.status}). Coba lagi.`);
  return response.json();
}

export async function allPages(path, key, signal, progress = () => {}, request = getJson) {
  const rows = [], cursors = new Set();
  let cursor = null, pages = 0;
  do {
    const url = new URL(path, 'http://localhost');
    url.searchParams.set('limit', '1000');
    if (cursor) url.searchParams.set(key === 'next_after' ? 'after' : 'cursor', cursor);
    const result = await request(url.pathname + url.search, signal);
    rows.push(...result.data); pages++;
    progress(rows.length, pages);
    cursor = result[key];
    if (cursor && cursors.has(cursor)) throw new Error('Pagination tidak bergerak. Muat ulang histori.');
    if (cursor) cursors.add(cursor);
  } while (cursor);
  return { rows, pages };
}

export function shiftDate(date, days) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}
export function todayIn(zone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
export function validRange(from, to) {
  return /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)
    && from <= to && Date.parse(to) - Date.parse(from) < 31 * 86400000;
}
export function chartRows(rows, maxGap) {
  const result = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i], time = Date.parse(row.measured_at), previous = rows[i - 1];
    if (previous && time - Date.parse(previous.measured_at) > maxGap * 1000) {
      result.push({ time: Date.parse(previous.measured_at) + 1, power: null });
    }
    const ambiguous = previous?.measured_at === row.measured_at || rows[i + 1]?.measured_at === row.measured_at;
    result.push({ time, power: row.power_w === null || row.quality !== 'valid' || ambiguous ? null : Number(row.power_w), original: row.power_w });
  }
  return result;
}
export function decimal(value, places = 3) {
  if (value === null || value === undefined) return 'Tidak tersedia';
  // Retain the exact API decimal in title/tooltip; this is display formatting only.
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: places }).format(Number(value));
}
