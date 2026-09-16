import { dailyConsumption } from './daily-consumption.js';

// Identifiers are fixed by callers, never derived from request input.
export function catalogScope(resource, userParam) {
  const room=resource==='rooms' ? 'id' : 'room_id';
  const overlap=resource==='meters' ? `AND ${resource}.kind='room' AND tstzrange(o.starts_at,o.ends_at,'[)') && tstzrange(${resource}.installed_at,${resource}.retired_at,'[)')` : '';
  return `(EXISTS(SELECT 1 FROM properties p JOIN users u ON u.id=p.owner_id
    WHERE p.id=${resource}.property_id AND u.id=${userParam} AND u.role='owner' AND u.is_active)
    OR EXISTS(SELECT 1 FROM occupancies o JOIN users u ON u.id=o.user_id
      WHERE o.user_id=${userParam} AND u.role='tenant' AND u.is_active AND o.room_id=${resource}.${room}
      AND o.starts_at<=now() ${overlap}))`;
}
export function readingScope(userParam, roomParam) {
  return `(EXISTS(SELECT 1 FROM users u JOIN properties p ON p.owner_id=u.id JOIN meters m ON m.property_id=p.id
    WHERE u.id=${userParam} AND u.role='owner' AND u.is_active AND m.id=meter_readings.meter_id)
    OR EXISTS(SELECT 1 FROM occupancies o JOIN users u ON u.id=o.user_id
      WHERE o.user_id=${userParam} AND u.role='tenant' AND u.is_active AND o.room_id=${roomParam}
      AND o.starts_at<=now() AND measured_at>=o.starts_at AND (o.ends_at IS NULL OR measured_at<o.ends_at)))`;
}
const milli=v=>new Date(v).getTime();
const nano=v=>BigInt(v.replace('.',''));
const format=n=>`${n/1000000000n}.${String(n%1000000000n).padStart(9,'0')}`;
export function tenantDaily(days,rows,segments,maxGap) {
  return days.flatMap(day=>{
    const relevant=segments.filter(s=>milli(s.starts_at)<milli(day.ends_at) && (!s.ends_at || milli(s.ends_at)>milli(day.starts_at)));
    if(!relevant.length) return [];
    const parts=relevant.map(s=>dailyConsumption([day],rows.filter(r=>milli(r.measured_at)>=milli(s.starts_at)
      && (!s.ends_at || milli(r.measured_at)<milli(s.ends_at))),maxGap)[0]);
    const full=parts.find(p=>p.status==='complete');
    if(full) return [full];
    const available=parts.filter(p=>p.observed_consumption_kwh!==null);
    const samples=parts.reduce((n,p)=>n+p.sample_count,0);
    return [{...parts[0],status:samples?'partial':'no_data',consumption_kwh:null,
      observed_consumption_kwh:available.length?format(available.reduce((n,p)=>n+nano(p.observed_consumption_kwh),0n)):null,
      coverage_seconds:parts.reduce((n,p)=>n+p.coverage_seconds,0),sample_count:samples,
      reasons:[...new Set([...parts.flatMap(p=>p.reasons),'access_limited'])]}];
  });
}
