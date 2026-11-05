import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import session from 'express-session';
import pgSession from 'connect-pg-simple';
import { Router, json } from 'express';
import { HttpError } from './http-input.js';
import { hashPassword,verifyPassword } from './password.js';
import {viewerGrant} from './owner-viewer.js';

export function authentication(pool, { secret, origin='http://127.0.0.1:3000', cookieName='smartbilling.sid', lifetime=8*3600000, secureCookie=false,
  accountLimit=Number(process.env.AUTH_LOGIN_ACCOUNT_LIMIT||5),ipLimit=Number(process.env.AUTH_LOGIN_IP_LIMIT||30),idleTimeout=15*60000,clock=Date.now }={}) {
  if (!secret || secret.length<32) throw new Error('Session secret belum tersedia');
  if(![accountLimit,ipLimit].every(v=>Number.isInteger(v)&&v>0&&v<=1000)) throw new Error('Batas login tidak valid');
  if(!Number.isSafeInteger(idleTimeout)||idleTimeout<=0)throw new Error('Batas inaktivitas tidak valid');
  const Store=pgSession(session);
  const store=new Store({pool,tableName:'auth_sessions',createTableIfMissing:false,disableTouch:true,
    errorLog:()=>console.warn('Session store tidak tersedia.')});
  const cookieOptions={httpOnly:true,sameSite:'lax',secure:secureCookie,path:'/'};
  const cookie={...cookieOptions,maxAge:lifetime};
  if(!/^[A-Za-z0-9_.-]{1,80}$/.test(cookieName))throw new Error('invalid_cookie_name');
  const middleware=session({name:cookieName,secret,store,resave:false,saveUninitialized:false,rolling:false,cookie});
  const router=Router(), attempts=new Map();
  const token=()=>randomBytes(32).toString('hex');
  const save=req=>new Promise((resolve,reject)=>req.session.save(e=>e?reject(e):resolve()));
  const lastActivity=req=>req.session.lastActivityAt??req.session.issuedAt;
  const sessionInfo=req=>({issued_at:req.session.issuedAt,last_activity_at:lastActivity(req),
    idle_timeout_ms:idleTimeout,idle_expires_at:lastActivity(req)+idleTimeout,expires_at:req.session.expiresAt,server_time:clock()});
  function csrf(req,_res,next) {
    const sent=req.get('x-csrf-token'), expected=req.session.csrf;
    if(req.get('origin')!==origin || typeof sent!=='string' || !expected || !/^[a-f0-9]{64}$/.test(sent)
      || !timingSafeEqual(Buffer.from(sent),Buffer.from(expected))) return next(new HttpError(403,'invalid_csrf'));
    next();
  }
  async function requireUser(req,_res,next) {
    try {
      if(!req.session?.userId || !Number.isFinite(req.session.expiresAt) || req.session.expiresAt<=clock()) throw new HttpError(401,'login_required');
      if(!Number.isFinite(lastActivity(req))||lastActivity(req)+idleTimeout<=clock())throw new HttpError(401,'session_idle_expired');
      const result=await pool.query('SELECT id,name,role FROM users WHERE id=$1 AND is_active=true',[req.session.userId]);
      if(!result.rowCount) throw new HttpError(401,'login_required');
      if(req.get('x-account-id') && req.get('x-account-id')!==result.rows[0].id) throw new HttpError(401,'account_changed');
      req.user=result.rows[0];
      if(req.user.role==='viewer') {
        req.viewerGrant=await viewerGrant(pool,req.user.id);
        if(!req.viewerGrant)throw new HttpError(401,'viewer_access_expired');
        req.user={...req.user,read_only:true,dashboard_role:'owner',access_expires_at:req.viewerGrant.expires_at};
      }
      next();
    } catch(e) {next(e);}
  }
  router.use(json({limit:'4kb'}));
  router.get('/csrf',async(req,res)=>{
    // Existing sessions are read-only here: polling/CSRF fetches must not reset
    // inactivity or overwrite a concurrent atomic activity update.
    if(!req.session.csrf){req.session.csrf=token();await save(req);}res.json({csrf:req.session.csrf});
  });
  router.post('/login',csrf,async(req,res)=>{
    const {email,password}=req.body||{};
    if(typeof email!=='string' || email.length>254 || typeof password!=='string' || Buffer.byteLength(password)>1024)
      throw new HttpError(400,'invalid_login_input');
    const normalized=email.trim().toLowerCase(), now=clock();
    for(const [k,v] of attempts) if(v.until<=now) attempts.delete(k);
    const keys=[`ip:${req.ip}`,`email:${createHash('sha256').update(normalized).digest('hex')}`];
    if(attempts.size>=10000 || keys.some((k,i)=>(attempts.get(k)?.count||0)>=(i?accountLimit:ipLimit))) throw new HttpError(429,'login_rate_limited');
    // Count before awaiting the hash so simultaneous attempts cannot bypass the limit.
    keys.forEach(k=>{const a=attempts.get(k)||{count:0,until:now+900000};a.count++;attempts.set(k,a);});
    const found=await pool.query('SELECT id,password_hash,is_active,role FROM users WHERE email=$1',[normalized]);
    const user=found.rows[0];
    let valid;
    try {valid=await verifyPassword(password,user?.password_hash);} catch {throw new HttpError(503,'service_unavailable');}
    if(!valid || !user.is_active) throw new HttpError(401,'invalid_credentials');
    if(user.role==='viewer' && !await viewerGrant(pool,user.id))throw new HttpError(403,'viewer_access_expired');
    attempts.delete(keys[1]);
    await new Promise((resolve,reject)=>req.session.regenerate(e=>e?reject(e):resolve()));
    req.session.userId=user.id; req.session.issuedAt=clock(); req.session.expiresAt=clock()+lifetime;
    req.session.lastActivityAt=req.session.issuedAt;
    req.session.csrf=token(); await save(req);
    res.json({ok:true});
  });
  router.post('/activate',csrf,async(req,res)=>{
    if(req.session?.userId) {
      const account=(await pool.query('SELECT role FROM users WHERE id=$1',[req.session.userId])).rows[0];
      if(account?.role==='viewer')throw new HttpError(403,'viewer_read_only');
    }
    const {token:raw,password}=req.body||{};
    if(typeof raw!=='string'||raw.length>200||typeof password!=='string'||password.length<8||Buffer.byteLength(password)>1024)
      throw new HttpError(400,'invalid_activation_input');
    const hash=createHash('sha256').update(raw).digest('hex'),passwordHash=await hashPassword(password),db=await pool.connect();
    try{
      await db.query('BEGIN');
      const invitation=(await db.query(`SELECT i.*,pt.user_id FROM tenant_invitations i JOIN property_tenants pt ON pt.id=i.property_tenant_id
        WHERE i.token_sha256=$1 FOR UPDATE OF i,pt`,[hash])).rows[0];
      if(!invitation||invitation.used_at||invitation.revoked_at||+new Date(invitation.expires_at)<=Date.now())throw new HttpError(400,'invalid_or_expired_invitation');
      const activated=await db.query("UPDATE users SET password_hash=$2,is_active=true,row_version=row_version+1,updated_at=now() WHERE id=$1 AND role='tenant' AND is_active=false",[invitation.user_id,passwordHash]);
      if(!activated.rowCount)throw new HttpError(409,'account_already_active');
      await db.query("UPDATE property_tenants SET status='active',row_version=row_version+1,updated_at=now() WHERE id=$1",[invitation.property_tenant_id]);
      await db.query('UPDATE tenant_invitations SET used_at=now() WHERE id=$1',[invitation.id]);
      await db.query('COMMIT');res.json({ok:true});
    }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{db.release();}
  });
  router.get('/me',requireUser,(req,res)=>res.json({user:req.user,session:sessionInfo(req)}));
  router.post('/activity',csrf,requireUser,async(req,res)=>{
    const age=req.body?.age_ms??0;
    if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||Object.keys(req.body).some(k=>k!=='age_ms')
      ||!Number.isInteger(age)||age<0||age>60000)throw new HttpError(400,'invalid_activity');
    const now=clock();
    // Update only the activity timestamp, atomically. Never save a stale whole
    // session, revive a deleted/expired session, or extend the absolute lifetime.
    const result=await pool.query(`UPDATE auth_sessions SET sess=jsonb_set(sess::jsonb,'{lastActivityAt}',
      to_jsonb(GREATEST(COALESCE((sess->>'lastActivityAt')::double precision,(sess->>'issuedAt')::double precision),
        (sess->>'issuedAt')::double precision,$2::double precision-$5::double precision)))::json
      WHERE sid=$1 AND sess->>'userId'=$4 AND (sess->>'expiresAt')::double precision>$2
        AND COALESCE((sess->>'lastActivityAt')::double precision,(sess->>'issuedAt')::double precision)>$2-$3
      RETURNING (sess->>'lastActivityAt')::double precision AS last_activity_at`,
    [req.sessionID,now,idleTimeout,req.user.id,age]);
    if(!result.rowCount)throw new HttpError(401,'session_idle_expired');
    const last=result.rows[0].last_activity_at;
    res.json({session:{...sessionInfo(req),last_activity_at:last,idle_expires_at:last+idleTimeout}});
  });
  router.post('/logout',csrf,async(req,res)=>{
    await new Promise((resolve,reject)=>req.session.destroy(e=>e?reject(e):resolve()));
    res.clearCookie(cookieName,cookieOptions).sendStatus(204);
  });
  return {middleware,router,requireUser,csrf,store};
}
