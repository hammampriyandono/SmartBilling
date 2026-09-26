export async function deviceReadiness(db,{ownerId,deviceUid,at=new Date().toISOString()}){
 const device=(await db.query(`SELECT d.id,d.property_id,d.device_uid,d.display_name,d.status,d.last_seen_at,d.source
  FROM devices d JOIN properties p ON p.id=d.property_id WHERE d.device_uid=$1 AND p.owner_id=$2`,[deviceUid,ownerId])).rows[0];
 if(!device)return null;
 const installations=(await db.query(`SELECT m.id,m.channel_no,m.kind,m.installed_at,m.retired_at,m.room_id,m.communal_load_id,m.source,
  a.id meter_asset_id,a.label meter_asset_label,a.serial_number,a.model,a.retired_at asset_retired_at
  FROM meters m LEFT JOIN meter_assets a ON a.id=m.meter_asset_id
  WHERE m.device_id=$1 AND m.installed_at<=$2 AND (m.retired_at IS NULL OR m.retired_at>$2)
  ORDER BY m.channel_no,m.id`,[device.id,at])).rows;
 const issues=[];if(device.status!=='active')issues.push('inactive_device');if(!installations.length)issues.push('no_active_installation');
 for(const row of installations){if(!row.meter_asset_id)issues.push(`channel_${row.channel_no}_missing_meter_asset`);if(row.asset_retired_at&&new Date(row.asset_retired_at)<=new Date(at))issues.push(`channel_${row.channel_no}_retired_meter_asset`);}
 const channels=new Set();for(const row of installations){if(channels.has(row.channel_no))issues.push(`channel_${row.channel_no}_multiple_installations`);channels.add(row.channel_no);}
 return{checked_at:at,ready:issues.length===0,issues:[...new Set(issues)],device,installations};
}
