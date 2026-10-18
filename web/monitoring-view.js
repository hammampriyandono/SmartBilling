import {isArchivedTestRecord} from '../src/display-policy.js';
export {isArchivedTestRecord} from '../src/display-policy.js';

export function monitoringCatalog(catalog, showTestData = false, now = Date.now()) {
  if (showTestData) return catalog;
  const rooms = catalog.rooms.filter(row => !isArchivedTestRecord(row));
  return activeCatalog({rooms,meters:catalog.meters.filter(row=>!isArchivedTestRecord(row))},now);
}

// Operational installations use their lifecycle, without a fixture-ID filter.
export function activeCatalog(catalog, now = Date.now()) {
  const rooms = catalog.rooms;
  const roomIds = new Set(rooms.map(row => row.id));
  const meters = catalog.meters.filter(row => (!row.installed_at || Date.parse(row.installed_at) <= now)
    && (!row.retired_at || Date.parse(row.retired_at) > now)
    && (row.kind !== 'room' || roomIds.has(row.room_id)));
  return { rooms, meters };
}

export function preferredMeter(meters, current) {
  return meters.some(row => row.id === current) ? current
    : (meters.find(row => row.kind === 'room') || meters[0])?.id || '';
}

export function readingSourceLabel(reading) {
  return reading?.data_source === 'simulation' ? 'Pembacaan simulasi terbaru'
    : reading?.data_source === 'production' ? 'Pembacaan perangkat terbaru'
    : 'Pembacaan terbaru · sumber belum tersedia';
}
