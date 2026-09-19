import {Router} from 'express';
import {HttpError,uuid,timeRange,timestamp,limit} from './http-input.js';
const scope=`(EXISTS(SELECT 1 FROM properties pr WHERE pr.id=f.property_id AND pr.owner_id=$1)
 OR EXISTS(SELECT 1 FROM session_participants sp JOIN occupancies oc ON oc.id=sp.occupancy_id WHERE sp.usage_session_id=s.id AND oc.user_id=$1))`;
export function rfidApi(pool) {
 const router=Router();router.use((req,_res,next)=>req.user?next():next(new HttpError(401,'login_required')));
 const meta={source:'simulation',authenticated:true};
 router.get('/facilities',async(req,res)=>{
  const size=limit(req.query.limit,50);if(size>100)throw new HttpError(400,'limit_max_100');
  const after=req.query.after?uuid(req.query.after):null;
  const result=await pool.query(`SELECT f.id,f.name,f.property_id,f.is_active,
   CASE WHEN EXISTS(SELECT 1 FROM usage_sessions s WHERE s.communal_load_id=f.id AND s.ended_at IS NULL AND s.status='review') THEN 'review'
   WHEN EXISTS(SELECT 1 FROM usage_sessions s WHERE s.communal_load_id=f.id AND s.ended_at IS NULL) THEN 'busy' ELSE 'available' END AS availability
   FROM communal_loads f JOIN properties p ON p.id=f.property_id WHERE f.load_type='attributable'
   AND (p.owner_id=$1 OR EXISTS(SELECT 1 FROM occupancies o JOIN rooms r ON r.id=o.room_id WHERE o.user_id=$1 AND r.property_id=f.property_id AND o.starts_at<=now() AND (o.ends_at IS NULL OR o.ends_at>now())))
   AND ($2::uuid IS NULL OR f.id>$2) ORDER BY f.id LIMIT $3`,[req.user.id,after,size+1]);
  const data=result.rows.slice(0,size);res.json({data,next_after:result.rows.length>size?data.at(-1).id:null,meta});
 });
 const fields=`s.id,s.communal_load_id AS facility_id,f.name AS facility_name,s.meter_id,s.started_at,s.ended_at,s.status,s.review_reason,
 s.energy_status,s.energy_reason,s.energy_kwh,extract(epoch FROM s.ended_at-s.started_at) AS duration_seconds`;
 router.get('/usage-sessions',async(req,res)=>{
  const {from,to}=timeRange(req.query),size=limit(req.query.limit,50);if(size>100)throw new HttpError(400,'limit_max_100');
  const facility=req.query.facility_id?uuid(req.query.facility_id):null;
  const status=req.query.status||null;if(status&&!['active','completed','review'].includes(status))throw new HttpError(400,'invalid_status');
  let cursorTime=null,cursorId=null;
  if(req.query.cursor){try{if(typeof req.query.cursor!=='string'||req.query.cursor.length>256)throw new Error();const c=JSON.parse(Buffer.from(req.query.cursor,'base64url'));cursorTime=timestamp(c.started_at);cursorId=uuid(c.id);}catch{throw new HttpError(400,'invalid_cursor');}}
  const result=await pool.query(`SELECT ${fields} FROM usage_sessions s JOIN communal_loads f ON f.id=s.communal_load_id WHERE ${scope}
   AND s.started_at<$3 AND (s.ended_at IS NULL OR s.ended_at>$2) AND ($4::uuid IS NULL OR f.id=$4)
   AND ($5::text IS NULL OR s.status=$5) AND ($6::timestamptz IS NULL OR (s.started_at,s.id)>($6::timestamptz,$7::uuid))
   ORDER BY s.started_at,s.id LIMIT $8`,[req.user.id,from,to,facility,status,cursorTime,cursorId,size+1]);
  const data=result.rows.slice(0,size),last=data.at(-1);
  res.json({data,next_cursor:result.rows.length>size?Buffer.from(JSON.stringify({started_at:last.started_at,id:last.id})).toString('base64url'):null,meta});
 });
 router.get('/usage-sessions/:id',async(req,res)=>{
  const result=await pool.query(`SELECT ${fields} FROM usage_sessions s JOIN communal_loads f ON f.id=s.communal_load_id WHERE s.id=$2 AND ${scope}`,[req.user.id,uuid(req.params.id)]);
  if(!result.rowCount)throw new HttpError(404,'session_not_found');res.json({data:result.rows[0],meta});
 });
 return router;
}
