import assert from 'node:assert/strict';
export const demoRfid={device:'00000000-0000-4000-8000-000000000302',facility:'00000000-0000-4000-8000-000000000303',meter:'00000000-0000-4000-8000-000000000304',reader:'00000000-0000-4000-8000-000000000305',card:'00000000-0000-4000-8000-000000000306',tenant:'00000000-0000-4000-8000-000000000201',property:'00000000-0000-4000-8000-000000000002',uid:'A0500001',deviceUid:'sim-rfid-01'};
export async function provisionRfid(db) {
 const d=demoRfid;
 assert.ok((await db.query(`SELECT 1 FROM users u JOIN occupancies o ON o.user_id=u.id JOIN rooms r ON r.id=o.room_id
  WHERE u.id=$1 AND u.is_active AND u.role='tenant' AND r.property_id=$2 AND o.starts_at<=now() AND (o.ends_at IS NULL OR o.ends_at>now())`,[d.tenant,d.property])).rowCount,'Tenant demo aktif dengan occupancy sah diperlukan; jalankan provisioning auth secara eksplisit.');
 const insert=async(table,fields,values)=>{
  await db.query(`INSERT INTO ${table}(${fields.join(',')}) VALUES(${values.map((_,i)=>`$${i+1}`).join(',')}) ON CONFLICT(id) DO NOTHING`,values);
  const row=(await db.query(`SELECT ${fields.join(',')} FROM ${table} WHERE id=$1`,[values[0]])).rows[0];
  fields.forEach((f,i)=>assert.equal(row[f] instanceof Date?row[f].toISOString():row[f],values[i],`Mapping ${table}.${f} konflik; tidak ditimpa`));
 };
 await insert('devices',['id','property_id','device_uid','status'],[d.device,d.property,d.deviceUid,'active']);
 await insert('communal_loads',['id','property_id','name','load_type','is_active'],[d.facility,d.property,'Fasilitas RFID — Simulasi','attributable',true]);
 await insert('meters',['id','property_id','device_id','communal_load_id','kind','channel_no','installed_at'],[d.meter,d.property,d.device,d.facility,'communal',0,'2026-09-15T00:00:00.000Z']);
 await insert('rfid_readers',['id','property_id','device_id','reader_channel','communal_load_id','active_from','active_until'],[d.reader,d.property,d.device,0,d.facility,'2026-09-15T00:00:00.000Z',null]);
 await insert('rfid_cards',['id','user_id','uid','label','registered_at','revoked_at'],[d.card,d.tenant,d.uid,'Kartu tenant — Simulasi','2026-09-15T00:00:00.000Z',null]);
 await db.query('INSERT INTO rfid_stream_state(device_id) VALUES($1) ON CONFLICT DO NOTHING',[d.device]);
}
