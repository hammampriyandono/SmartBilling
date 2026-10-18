import {Router,json} from 'express';
import {randomUUID,createHmac} from 'node:crypto';
import {HttpError,uuid,limit} from './http-input.js';
import {calendarMonth,purchaseDate,integerRupiah,monthlyTokenSummary} from './token-summary.js';

const keyPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const allowed=(body,keys)=>{if(!body||Array.isArray(body)||typeof body!=='object'||Object.keys(body).some(k=>!keys.includes(k)))throw new HttpError(400,'invalid_body');};
function text(value,required=false){if(value===undefined||value===null||value===''){if(required)throw new HttpError(400,'reason_required');return null;}if(typeof value!=='string'||value.trim().length>500||required&&!value.trim())throw new HttpError(400,'invalid_text');return value.trim()||null;}
const projection=`h.*,v.purchase_date::text,v.amount_rp::text,v.note,v.reason,v.actor_user_id,v.request_id,v.occurred_at`;
export function tokenApi(pool,{csrf,idempotencySecret}){
 const r=Router();r.use('/owner/token-purchases',owner);r.use('/owner/monthly-token-summary',owner);
 function owner(req,_res,next){return req.user?.role==='owner'?next():next(new HttpError(403,'owner_required'));}
 r.use(json({limit:'8kb'}));
 function mutate(req,res,next){csrf(req,res,e=>{if(e)return next(e);const key=req.get('idempotency-key');if(!keyPattern.test(key||''))return next(new HttpError(400,'idempotency_key_required'));req.tokenKey=key.toLowerCase();next();});}
 async function prop(db,id,ownerId){const p=(await db.query('SELECT id,timezone FROM properties WHERE id=$1 AND owner_id=$2 FOR SHARE',[uuid(id),ownerId])).rows[0];if(!p)throw new HttpError(404,'property_not_found');return p;}
 async function record(db,id,ownerId,lock=false){const q=await db.query(`SELECT ${projection} FROM token_purchases h JOIN token_purchase_revisions v ON v.purchase_id=h.id AND v.row_version=h.row_version JOIN properties p ON p.id=h.property_id WHERE h.id=$1 AND p.owner_id=$2 ${lock?'FOR UPDATE OF h':''}`,[uuid(id),ownerId]);if(!q.rowCount)throw new HttpError(404,'token_purchase_not_found');return q.rows[0];}
 async function tx(req,action){const db=await pool.connect(),hash=createHmac('sha256',idempotencySecret).update(JSON.stringify([req.user.id,req.tokenKey,req.method,req.originalUrl,req.body])).digest('hex');try{
  await db.query('BEGIN');if(!(await db.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) acquired',[`${req.user.id}:${req.tokenKey}`])).rows[0].acquired)throw new HttpError(409,'idempotency_in_progress');
  const prior=(await db.query('SELECT * FROM owner_idempotency WHERE owner_id=$1 AND request_key=$2',[req.user.id,req.tokenKey])).rows[0];if(prior){if(prior.request_sha256!==hash)throw new HttpError(409,'idempotency_key_conflict');await db.query('COMMIT');return prior.response_data;}
  const out=await action(db);await db.query('INSERT INTO owner_idempotency(owner_id,request_key,request_sha256,response_data) VALUES($1,$2,$3,$4)',[req.user.id,req.tokenKey,hash,out]);await db.query('COMMIT');return out;
 }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{db.release();}}
 async function append(db,req,action,id,version,status,values,reason,before){const requestId=randomUUID();
  await db.query(`INSERT INTO token_purchase_revisions(purchase_id,row_version,action,status,purchase_date,amount_rp,note,reason,actor_user_id,request_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[id,version,action,status,values.purchase_date,values.amount_rp,values.note,reason,req.user.id,requestId]);
  const after=await record(db,id,req.user.id);
  await db.query('INSERT INTO audit_logs(property_id,actor_user_id,request_id,action,entity_type,entity_id,before_data,after_data,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[after.property_id,req.user.id,requestId,`token_purchase_${action}`,'token_purchase',id,before,after,reason||'Pencatatan pembelian token']);return after;
 }
 function values(body){return{purchase_date:purchaseDate(body.purchase_date),amount_rp:integerRupiah(body.amount_rp),note:text(body.note)};}
 r.get('/owner/monthly-token-summary',async(req,res)=>{const p=await prop(pool,req.query.property_id,req.user.id);res.json({data:await monthlyTokenSummary(pool,p,calendarMonth(req.query.month))});});
 r.get('/owner/token-purchases',async(req,res)=>{const p=await prop(pool,req.query.property_id,req.user.id),month=calendarMonth(req.query.month),size=limit(req.query.limit,100),after=req.query.after?uuid(req.query.after):null;
  const q=await pool.query(`SELECT ${projection} FROM token_purchases h JOIN token_purchase_revisions v ON v.purchase_id=h.id AND v.row_version=h.row_version WHERE h.property_id=$1 AND v.purchase_date>=($2||'-01')::date AND v.purchase_date<(($2||'-01')::date+interval '1 month') AND ($3::uuid IS NULL OR h.id>$3) ORDER BY h.id LIMIT $4`,[p.id,month,after,size+1]);const data=q.rows.slice(0,size);res.json({data,next_after:q.rows.length>size?data.at(-1).id:null});
 });
 r.get('/owner/token-purchases/:id/revisions',async(req,res)=>{const row=await record(pool,req.params.id,req.user.id);const q=await pool.query('SELECT *,purchase_date::text,amount_rp::text FROM token_purchase_revisions WHERE purchase_id=$1 ORDER BY row_version',[row.id]);res.json({data:q.rows});});
 r.post('/owner/token-purchases',mutate,async(req,res)=>{allowed(req.body,['property_id','purchase_date','amount_rp','note']);const parsed=values(req.body);const out=await tx(req,async db=>{const p=await prop(db,req.body.property_id,req.user.id),id=randomUUID();await db.query("INSERT INTO token_purchases(id,property_id,recorded_by,status) VALUES($1,$2,$3,'active')",[id,p.id,req.user.id]);return append(db,req,'create',id,1,'active',parsed,null,null);});res.status(201).json({data:out});});
 async function update(req,res,action){allowed(req.body,action==='cancel'?['row_version','reason']:['row_version','reason','purchase_date','amount_rp','note']);const reason=text(req.body.reason,true),parsed=action==='correct'?values(req.body):null;
  if(!Number.isInteger(req.body.row_version)||req.body.row_version<1)throw new HttpError(400,'invalid_row_version');
  const out=await tx(req,async db=>{const old=await record(db,req.params.id,req.user.id,true);if(old.row_version!==req.body.row_version)throw new HttpError(409,'stale_version');if(old.status!=='active')throw new HttpError(409,'token_purchase_cancelled');const status=action==='cancel'?'cancelled':'active';await db.query('UPDATE token_purchases SET status=$2,row_version=row_version+1,updated_at=now() WHERE id=$1',[old.id,status]);return append(db,req,action,old.id,old.row_version+1,status,parsed||old,reason,old);});res.json({data:out});
 }
 r.patch('/owner/token-purchases/:id',mutate,(req,res)=>update(req,res,'correct'));
 r.post('/owner/token-purchases/:id/cancel',mutate,(req,res)=>update(req,res,'cancel'));
 return r;
}
