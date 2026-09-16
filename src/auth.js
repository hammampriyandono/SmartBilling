import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import session from 'express-session';
import pgSession from 'connect-pg-simple';
import { Router, json } from 'express';
import { HttpError } from './http-input.js';
import { verifyPassword } from './password.js';

export function authentication(pool, { secret, origin='http://127.0.0.1:3000', lifetime=8*3600000,
  accountLimit=Number(process.env.AUTH_LOGIN_ACCOUNT_LIMIT||5),ipLimit=Number(process.env.AUTH_LOGIN_IP_LIMIT||30) }={}) {
  if (!secret || secret.length<32) throw new Error('Session secret belum tersedia');
  if(![accountLimit,ipLimit].every(v=>Number.isInteger(v)&&v>0&&v<=1000)) throw new Error('Batas login tidak valid');
  const Store=pgSession(session);
  const store=new Store({pool,tableName:'auth_sessions',createTableIfMissing:false,disableTouch:true,
    errorLog:()=>console.warn('Session store tidak tersedia.')});
  const cookie={httpOnly:true,sameSite:'lax',secure:false,path:'/',maxAge:lifetime};
  const middleware=session({name:'smartbilling.sid',secret,store,resave:false,saveUninitialized:false,rolling:false,cookie});
  const router=Router(), attempts=new Map();
  const token=()=>randomBytes(32).toString('hex');
  const save=req=>new Promise((resolve,reject)=>req.session.save(e=>e?reject(e):resolve()));
  function csrf(req,_res,next) {
    const sent=req.get('x-csrf-token'), expected=req.session.csrf;
    if(req.get('origin')!==origin || typeof sent!=='string' || !expected || !/^[a-f0-9]{64}$/.test(sent)
      || !timingSafeEqual(Buffer.from(sent),Buffer.from(expected))) return next(new HttpError(403,'invalid_csrf'));
    next();
  }
  async function requireUser(req,_res,next) {
    try {
      if(!req.session?.userId || !Number.isFinite(req.session.expiresAt) || req.session.expiresAt<=Date.now()) throw new HttpError(401,'login_required');
      const result=await pool.query('SELECT id,name,role FROM users WHERE id=$1 AND is_active=true',[req.session.userId]);
      if(!result.rowCount) throw new HttpError(401,'login_required');
      if(req.get('x-account-id') && req.get('x-account-id')!==result.rows[0].id) throw new HttpError(401,'account_changed');
      req.user=result.rows[0]; next();
    } catch(e) {next(e);}
  }
  router.use(json({limit:'4kb'}));
  router.get('/csrf',async(req,res)=>{
    req.session.csrf ??= token(); await save(req); res.json({csrf:req.session.csrf});
  });
  router.post('/login',csrf,async(req,res)=>{
    const {email,password}=req.body||{};
    if(typeof email!=='string' || email.length>254 || typeof password!=='string' || Buffer.byteLength(password)>1024)
      throw new HttpError(400,'invalid_login_input');
    const normalized=email.trim().toLowerCase(), now=Date.now();
    for(const [k,v] of attempts) if(v.until<=now) attempts.delete(k);
    const keys=[`ip:${req.ip}`,`email:${createHash('sha256').update(normalized).digest('hex')}`];
    if(attempts.size>=10000 || keys.some((k,i)=>(attempts.get(k)?.count||0)>=(i?accountLimit:ipLimit))) throw new HttpError(429,'login_rate_limited');
    // Count before awaiting the hash so simultaneous attempts cannot bypass the limit.
    keys.forEach(k=>{const a=attempts.get(k)||{count:0,until:now+900000};a.count++;attempts.set(k,a);});
    const found=await pool.query('SELECT id,password_hash,is_active FROM users WHERE email=$1',[normalized]);
    const user=found.rows[0];
    let valid;
    try {valid=await verifyPassword(password,user?.password_hash);} catch {throw new HttpError(503,'service_unavailable');}
    if(!valid || !user.is_active) throw new HttpError(401,'invalid_credentials');
    attempts.delete(keys[1]);
    await new Promise((resolve,reject)=>req.session.regenerate(e=>e?reject(e):resolve()));
    req.session.userId=user.id; req.session.issuedAt=Date.now(); req.session.expiresAt=Date.now()+lifetime;
    req.session.csrf=token(); await save(req);
    res.json({ok:true});
  });
  router.get('/me',requireUser,(req,res)=>res.json({user:req.user}));
  router.post('/logout',csrf,async(req,res)=>{
    await new Promise((resolve,reject)=>req.session.destroy(e=>e?reject(e):resolve()));
    res.clearCookie('smartbilling.sid',{httpOnly:true,sameSite:'lax',secure:false,path:'/'}).sendStatus(204);
  });
  return {middleware,router,requireUser,store};
}
