// Presentation-only archive of verified fixtures (HANDOFF, 18 October 2026).
// Names are never evidence: manual property/tenant records remain visible.
export const archivedFixtureIds = [
  'da7a96ec-b738-435e-a617-3a20855edda1',
  '6051aefa-df09-4fec-a9bc-1606c5f5f5f9',
  'e12cc502-be3d-4422-9a89-5c9449272066',
  'e6da1fe6-5040-4798-bcc6-c0e43cce9629',
  '83e88a33-b6f9-4576-b38e-09c2fc1538ff',
  '17d83d75-d2ee-4992-b32e-b883decf262a',
  'b594b01f-0864-4e53-9858-8e9e08d0e3d4',
  'd5398e7e-2b75-45e1-b371-ad6f087b6e66',
  '9e4b2214-fca3-4fae-81f4-3103e6c0b9bb',
  '742f389c-1e94-4a4f-a1d1-cd0b5374fcd7',
  'b1d73648-a334-4a46-95fd-1eeb2e8ffbec',
  '5e195365-a7ff-4226-a13d-fa6ee44fd416',
  '92063e15-ce5c-4ef5-a872-c315a284816f',
  'd6c12b3c-ca06-4a9b-b16a-3ad268756cb4',
  '39cc2d42-527e-4a61-84ea-f5392c2ba896',
  ...['003','004','005','006','007','008','103','104','105','201','302','303','304','305','306']
    .map(suffix => `00000000-0000-4000-8000-000000000${suffix}`)
];
const archived = new Set(archivedFixtureIds);
const references = ['id','property_id','room_id','device_id','meter_id','meter_asset_id','asset_id',
  'facility_id','communal_load_id','reader_id','user_id','tenant_id','occupancy_id'];
export function isArchivedTestRecord(row, hiddenIds = archived) {
  return ['simulation','mixed'].includes(row.source) || ['simulation','mixed'].includes(row.data_source)
    || references.some(key => hiddenIds.has(row[key]));
}
export const visibleRecords = (rows, showTestData = false) => showTestData ? rows : rows.filter(row => !isArchivedTestRecord(row));

// Propagate hidden parents to their children, regardless of response order.
export function visibleAdministration(data, showTestData = false) {
  if (showTestData) return data;
  const hidden = new Set(archived);
  let changed;
  do {
    changed = false;
    for (const rows of Object.values(data)) for (const row of rows) {
      if (row.id && !hidden.has(row.id) && isArchivedTestRecord(row, hidden)) { hidden.add(row.id); changed = true; }
    }
  } while (changed);
  return Object.fromEntries(Object.entries(data).map(([key,rows]) => [key,rows.filter(row => !isArchivedTestRecord(row,hidden))]));
}

export function visibleHealth(data, showTestData = false) {
  if (showTestData) return data;
  const hidden = new Set(archived);
  for (const device of data.devices) if (isArchivedTestRecord(device)) hidden.add(device.id);
  const devices = data.devices.filter(row => !isArchivedTestRecord(row,hidden))
    .map(row => ({...row,meters:row.meters.filter(meter => !isArchivedTestRecord(meter,hidden))}));
  const alerts = data.alerts.filter(row => !isArchivedTestRecord(row,hidden));
  const summary = Object.fromEntries(['online','delayed','offline','never_seen','needs_review'].map(status => [status,devices.filter(d => d.status === status).length]));
  summary.active_alerts = alerts.filter(a => a.status === 'active').length;
  return {...data,devices,alerts,summary};
}
export const viewPath = (path,showTestData) => showTestData ? path : `${path}${path.includes('?')?'&':'?'}data_view=observation`;

// Columns are internal constants, never request input. Filter before pagination/aggregation.
export function observationSql(query, ids = [], sources = []) {
  if (query.data_view !== 'observation') return '';
  const names = [...ids,...sources];
  if (names.some(name => !/^[a-z_]+\.[a-z_]+$/.test(name))) throw new Error('invalid_display_column');
  const list = archivedFixtureIds.map(id => `'${id}'`).join(',');
  return [...ids.map(column => `COALESCE(${column} NOT IN (${list}),true)`),
    ...sources.map(column => `COALESCE(${column} NOT IN ('simulation','mixed'),true)`)]
    .map(condition => ` AND ${condition}`).join('');
}
export function billingObservationSql(query) {
  if (query.data_view !== 'observation') return '';
  return observationSql(query,['bp.property_id'],['bp.source'])
    + ` AND NOT EXISTS (SELECT 1 FROM room_bills archive_rb JOIN rooms archive_room ON archive_room.id=archive_rb.room_id WHERE archive_rb.billing_period_id=bp.id AND NOT (true${observationSql(query,['archive_room.id','archive_room.property_id'],['archive_room.source'])}))`
    + ` AND NOT EXISTS (SELECT 1 FROM room_bills archive_rb JOIN bill_shares archive_bs ON archive_bs.room_bill_id=archive_rb.id JOIN occupancies archive_oc ON archive_oc.id=archive_bs.occupancy_id WHERE archive_rb.billing_period_id=bp.id AND NOT (true${observationSql(query,['archive_oc.id','archive_oc.user_id','archive_oc.room_id'],['archive_oc.source'])}))`;
}
