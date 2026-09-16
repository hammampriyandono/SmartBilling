import { Router } from 'express';
import { HttpError, uuid, limit, timestamp, timeRange } from './http-input.js';
import { dailyConsumption } from './daily-consumption.js';
import { catalogScope, readingScope, tenantDaily } from './access.js';

const columns = `id, meter_id, boot_id, sequence_no, counter_epoch, measured_at, received_at,
 voltage_v, current_a, power_w, energy_kwh, frequency_hz, power_factor, quality`;

export function monitoringApi(pool, { maxGapSeconds = 120 } = {}) {
  if (!Number.isInteger(maxGapSeconds) || maxGapSeconds < 1 || maxGapSeconds > 86400) throw new Error('Invalid gap configuration');
  const router = Router();
  router.use((req,_res,next)=>req.user ? next() : next(new HttpError(401,'login_required')));
  const meta = { source: 'simulation', environment: 'development', authenticated: true };
  for (const resource of ['rooms', 'meters']) {
    router.get(`/${resource}`, async (req, res) => {
      const size = limit(req.query.limit);
      const after = req.query.after === undefined ? null : uuid(req.query.after);
      const property = req.query.property_id === undefined ? null : uuid(req.query.property_id);
      const fields = resource === 'rooms'
        ? 'id, property_id, code, name, active_from, active_until'
        : 'id, property_id, device_id, room_id, communal_load_id, kind, channel_no, installed_at, retired_at';
      // Table and fields come only from this fixed allowlist, never request text.
      const result = await pool.query(`SELECT ${fields} FROM ${resource}
        WHERE ($1::uuid IS NULL OR id > $1) AND ($2::uuid IS NULL OR property_id = $2)
        AND ${catalogScope(resource,'$4')}
        ORDER BY id LIMIT $3`, [after, property, size + 1, req.user.id]);
      const data = result.rows.slice(0, size);
      res.json({ data, next_after: result.rows.length > size ? data.at(-1).id : null, meta });
    });
  }
  router.param('id', async (req, _res, next, id) => {
    try {
      uuid(id);
      const meter = await pool.query(`SELECT meters.*, p.timezone FROM meters JOIN properties p ON p.id=meters.property_id
        WHERE meters.id=$1 AND ${catalogScope('meters','$2')}`, [id, req.user.id]);
      if (!meter.rowCount) throw new HttpError(404, 'meter_not_found');
      req.meter = meter.rows[0];
      next();
    } catch (error) { next(error); }
  });
  router.get('/meters/:id/latest', async (req, res) => {
    const result = await pool.query(`SELECT ${columns} FROM meter_readings WHERE meter_id=$1
      AND ${readingScope('$2','$3')} ORDER BY measured_at DESC,id DESC LIMIT 1`, [req.params.id,req.user.id,req.meter.room_id]);
    res.json({ data: result.rows[0] || null, meta });
  });
  router.get('/meters/:id/readings', async (req, res) => {
    const { from, to } = timeRange(req.query);
    const size = limit(req.query.limit);
    let cursorTime = null;
    let cursorId = null;
    if (req.query.cursor !== undefined) {
      try {
        if (typeof req.query.cursor !== 'string' || req.query.cursor.length > 256) throw new Error();
        const cursor = JSON.parse(Buffer.from(req.query.cursor, 'base64url').toString());
        cursorTime = timestamp(cursor.measured_at);
        cursorId = cursor.id;
        if (typeof cursorId !== 'string' || !/^[1-9]\d{0,18}$/.test(cursorId)
            || BigInt(cursorId) > 9223372036854775807n) throw new Error();
      } catch { throw new HttpError(400, 'invalid_cursor'); }
    }
    const result = await pool.query(`SELECT ${columns} FROM meter_readings
      WHERE meter_id=$1 AND measured_at >= $2 AND measured_at < $3
      AND ($4::timestamptz IS NULL OR (measured_at,id) > ($4::timestamptz,$5::bigint))
      AND ${readingScope('$7','$8')}
      ORDER BY measured_at,id LIMIT $6`, [req.params.id, from, to, cursorTime, cursorId, size + 1, req.user.id,req.meter.room_id]);
    const data = result.rows.slice(0, size);
    if(req.user.role==='tenant') {
      const segments=(await pool.query('SELECT id,starts_at,ends_at FROM occupancies WHERE user_id=$1 AND room_id=$2 AND starts_at<=now()',[req.user.id,req.meter.room_id])).rows;
      for(const row of data) row.access_segment=segments.find(s=>new Date(row.measured_at)>=new Date(s.starts_at)
        && (!s.ends_at || new Date(row.measured_at)<new Date(s.ends_at)))?.id;
    }
    const last = data.at(-1);
    const next = result.rows.length > size
      ? Buffer.from(JSON.stringify({ measured_at: last.measured_at, id: last.id })).toString('base64url') : null;
    res.json({ data, next_cursor: next, range: { from, to, bounds: '[from,to)' }, meta });
  });
  router.get('/meters/:id/daily', async (req, res) => {
    const dates = [req.query.from, req.query.to];
    for (const value of dates) {
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new HttpError(400, 'daily_requires_dates');
      timestamp(`${value}T00:00:00Z`);
    }
    if (dates[0] >= dates[1] || Date.parse(dates[1]) - Date.parse(dates[0]) > 31 * 86400000) {
      throw new HttpError(400, 'range_must_be_positive_and_at_most_31_days');
    }
    const bounds = await pool.query(`SELECT to_char(day,'YYYY-MM-DD') AS date,
      day AT TIME ZONE $3 AS starts_at, (day + interval '1 day') AT TIME ZONE $3 AS ends_at
      FROM generate_series($1::date::timestamp, ($2::date - 1)::timestamp, interval '1 day') AS day`,
    [dates[0], dates[1], req.meter.timezone]);
    const start = bounds.rows[0].starts_at;
    const end = bounds.rows.at(-1).ends_at;
    const result = await pool.query(`SELECT id,measured_at,energy_kwh,counter_epoch,quality FROM (
      (SELECT id,measured_at,energy_kwh,counter_epoch,quality FROM meter_readings WHERE meter_id=$1 AND measured_at < $2
        AND ${readingScope('$4','$5')}
        ORDER BY measured_at DESC,id DESC LIMIT 1)
      UNION ALL
      (SELECT id,measured_at,energy_kwh,counter_epoch,quality FROM meter_readings WHERE meter_id=$1 AND measured_at >= $2 AND measured_at <= $3
        AND ${readingScope('$4','$5')}
        ORDER BY measured_at,id LIMIT 100001)
      ) AS samples ORDER BY measured_at,id`, [req.params.id, start, end,req.user.id,req.meter.room_id]);
    if (result.rows.length > 100000) throw new HttpError(422, 'too_many_samples_shorten_range');
    let data;
    if(req.user.role==='tenant') {
      const segments=(await pool.query('SELECT starts_at,ends_at FROM occupancies WHERE user_id=$1 AND room_id=$2 AND starts_at<=now()',[req.user.id,req.meter.room_id])).rows;
      data=tenantDaily(bounds.rows,result.rows,segments,maxGapSeconds);
    } else data=dailyConsumption(bounds.rows, result.rows, maxGapSeconds);
    res.json({ data, range:{from:start,to:end},
      meta: { ...meta, access_limited:req.user.role==='tenant', timezone: req.meter.timezone, max_gap_seconds: maxGapSeconds, interpolation: false } });
  });
  return router;
}

export function apiError(error, _req, res, _next) {
  if(error.type==='entity.parse.failed') return res.status(400).json({error:'invalid_json'});
  if(error.type==='entity.too.large') return res.status(413).json({error:'body_too_large'});
  const known = error instanceof HttpError;
  if (!known) console.warn('Permintaan API gagal; detail database tidak ditampilkan.');
  res.status(known ? error.status : 503).json({ error: known ? error.message : 'service_unavailable' });
}
