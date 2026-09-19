const units=s=>BigInt(s.replace('.',''));
export function sessionEnergy(rows,start,end,gap=120) {
 const result={energy_kwh:null,energy_status:'unavailable',energy_reason:'missing_boundary',start_reading_id:null,end_reading_id:null};
 if(!end)return {...result,energy_reason:'session_open'};
 if(rows.length<2 || +new Date(rows[0].measured_at)!==+new Date(start)||+new Date(rows.at(-1).measured_at)!==+new Date(end))return result;
 for(let i=0;i<rows.length;i++) {
  const row=rows[i],prev=rows[i-1];
  if(row.quality!=='valid')return {...result,energy_reason:'invalid_quality'};
  if(prev){const seconds=(+new Date(row.measured_at)-+new Date(prev.measured_at))/1000;
   const reason=seconds<=0?'ambiguous_timestamp':seconds>gap?'gap':row.counter_epoch!==prev.counter_epoch?'counter_reset':units(row.energy_kwh)<units(prev.energy_kwh)?'counter_decreased':null;
   if(reason)return {...result,energy_reason:reason};
  }
 }
 const delta=units(rows.at(-1).energy_kwh)-units(rows[0].energy_kwh);
 return {energy_kwh:`${delta/1000000000n}.${String(delta%1000000000n).padStart(9,'0')}`,energy_status:'valid',energy_reason:null,start_reading_id:rows[0].id,end_reading_id:rows.at(-1).id};
}
export async function reconcileSession(db,s,gap=120) {
 const rows=(await db.query('SELECT id,measured_at,energy_kwh,counter_epoch,quality FROM meter_readings WHERE meter_id=$1 AND measured_at >= $2 AND measured_at <= $3 ORDER BY measured_at,id LIMIT 100001',[s.meter_id,s.started_at,s.ended_at])).rows;
 const e=rows.length>100000?{energy_kwh:null,energy_status:'unavailable',energy_reason:'too_many_samples',start_reading_id:null,end_reading_id:null}:sessionEnergy(rows,s.started_at,s.ended_at,gap);
 await db.query('UPDATE usage_sessions SET energy_kwh=$2,energy_status=$3,energy_reason=$4,start_reading_id=$5,end_reading_id=$6 WHERE id=$1',[s.id,e.energy_kwh,e.energy_status,e.energy_reason,e.start_reading_id,e.end_reading_id]);
 return e;
}
