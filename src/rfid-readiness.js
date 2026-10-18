// Read-only commissioning view; deliberately excludes card UIDs and MQTT payloads.
export async function rfidReadiness(db,{ownerId,deviceUid,at=new Date().toISOString()}) {
 const device=(await db.query(`SELECT d.id,d.device_uid,d.property_id,d.status,d.source FROM devices d
  JOIN properties p ON p.id=d.property_id WHERE d.device_uid=$1 AND p.owner_id=$2`,[deviceUid,ownerId])).rows[0];
 if(!device)return null;
 const readers=(await db.query(`SELECT r.id,r.reader_channel,r.source,r.communal_load_id,f.name facility_name,f.load_type,f.is_active,
  f.source facility_source,m.id meter_installation_id,m.meter_asset_id,m.source meter_source,m.device_id meter_device_id,
  a.status asset_status,a.source asset_source,md.source meter_device_source FROM rfid_readers r JOIN communal_loads f ON f.id=r.communal_load_id
  LEFT JOIN meters m ON m.communal_load_id=f.id AND m.installed_at<=$2 AND (m.retired_at IS NULL OR m.retired_at>$2)
  LEFT JOIN meter_assets a ON a.id=m.meter_asset_id
  LEFT JOIN devices md ON md.id=m.device_id
  WHERE r.device_id=$1 AND r.active_from<=$2 AND (r.active_until IS NULL OR r.active_until>$2) ORDER BY r.reader_channel,r.id`,[device.id,at])).rows;
 const issues=[];
 if(device.status!=='active')issues.push('inactive_device');
 if(device.source==='simulation')issues.push('simulation_device');
 if(!readers.length)issues.push('no_active_reader');
 for(const r of readers){
  if(!r.is_active||r.load_type!=='attributable')issues.push(`reader_${r.reader_channel}_unavailable_facility`);
  if(!r.meter_installation_id||!r.meter_asset_id||r.asset_status!=='active')issues.push(`reader_${r.reader_channel}_missing_active_meter`);
  if([r.source,r.facility_source,r.meter_source,r.asset_source,r.meter_device_source].includes('simulation'))issues.push(`reader_${r.reader_channel}_simulation_context`);
 }
 const stream=(await db.query(`SELECT e.boot_id,e.sequence_no,e.processing_status FROM rfid_stream_state s
  LEFT JOIN device_events e ON e.id=s.head_event_id WHERE s.device_id=$1`,[device.id])).rows[0]||null;
 return {checked_at:at,ready:issues.length===0,issues:[...new Set(issues)],device,readers,stream,
  note:'Kartu aktif, akun tenant dan occupancy pada properti yang sama wajib diverifikasi terpisah. Energi memerlukan pembacaan batas sesi.'};
}
