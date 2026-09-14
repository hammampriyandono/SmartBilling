import { parseSensor, Rejection, sha256, sameReading, optionalFields } from './sensor-message.js';

export async function ingestSensor(pool, topic, bytes, packet = {}) {
  async function reject(reason, connection = pool) {
    await connection.query(`INSERT INTO mqtt_rejections(reason,topic_sha256,payload_sha256,payload_bytes) VALUES ($1,$2,$3,$4)`,
      [reason, sha256(topic), sha256(bytes), bytes.length]);
    return { status: 'rejected', reason };
  }
  let decoded;
  try { decoded = parseSensor(topic, bytes, packet); }
  catch (error) { if (error instanceof Rejection) return reject(error.message); throw error; }
  const { device_uid, reading: r } = decoded;
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    // Serialize the physical source identity, even if a retry changes the installation timestamp.
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [JSON.stringify([device_uid, r.channel_no, r.boot_id, r.sequence_no])]);
    const device = await db.query('SELECT id,status FROM devices WHERE device_uid=$1 FOR UPDATE', [device_uid]);
    let result;
    if (!device.rowCount || device.rows[0].status !== 'active') result = await reject('unknown_or_inactive_device', db);
    else {
      const existing = await db.query(`SELECT r.* FROM meter_readings r JOIN meters m ON m.id=r.meter_id
        WHERE m.device_id=$1 AND m.channel_no=$2 AND r.boot_id=$3 AND r.sequence_no=$4`,
        [device.rows[0].id, r.channel_no, r.boot_id, r.sequence_no]);
      if (existing.rowCount) {
        result = existing.rowCount === 1 && sameReading(existing.rows[0], r)
          ? { status: 'duplicate' } : await reject('identity_conflict', db);
      } else {
        const meters = await db.query(`SELECT id FROM meters WHERE device_id=$1 AND channel_no=$2
          AND installed_at <= $3 AND (retired_at IS NULL OR retired_at > $3) FOR SHARE`,
          [device.rows[0].id, r.channel_no, r.measured_at]);
        if (meters.rowCount !== 1) result = await reject('unmapped_channel_or_time', db);
        else {
          const fields = Object.keys(optionalFields);
          await db.query(`INSERT INTO meter_readings(meter_id,boot_id,sequence_no,counter_epoch,measured_at,energy_kwh,quality,${fields.join(',')})
            VALUES ($1,$2,$3,$4,$5,$6,'valid',$7,$8,$9,$10,$11)`,
            [meters.rows[0].id, r.boot_id, r.sequence_no, r.counter_epoch, r.measured_at, r.energy_kwh, ...fields.map((key) => r[key])]);
          await db.query('UPDATE devices SET last_seen_at=GREATEST(last_seen_at,now()) WHERE id=$1', [device.rows[0].id]);
          result = { status: 'inserted' };
        }
      }
    }
    await db.query('COMMIT');
    return result;
  } catch (error) { await db.query('ROLLBACK').catch(() => {}); throw error; }
  finally { db.release(); }
}
