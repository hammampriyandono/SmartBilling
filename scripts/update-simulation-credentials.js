import {readFile} from 'node:fs/promises';
import {randomBytes,scryptSync} from 'node:crypto';
import {createPool,requireDevelopment} from '../src/connections.js';

requireDevelopment();
const [ownerFile,tenantFile,...extra]=process.argv.slice(2);
if(!ownerFile||!tenantFile||extra.length)throw new Error('Pemakaian: node scripts/update-simulation-credentials.js /owner-password-file /tenant-password-file');
const accounts=[
 {id:'00000000-0000-4000-8000-000000000001',role:'owner',oldEmail:'owner@simulation.invalid',email:'owner@simulation.local',file:ownerFile},
 {id:'00000000-0000-4000-8000-000000000201',role:'tenant',oldEmail:'tenant@simulation.invalid',email:'tenant@simulation.local',file:tenantFile},
];
function localHash(password){
 const salt=randomBytes(16).toString('hex');
 return `scrypt-v1:131072:8:1:${salt}:${scryptSync(password,salt,64,{N:131072,r:8,p:1,maxmem:160*1024*1024}).toString('hex')}`;
}
const pool=createPool({timeout:15000});let db;
try{
 const prepared=[];
 for(const account of accounts){
  const password=(await readFile(account.file,'utf8')).trim();
  if(!password||Buffer.byteLength(password)>1024)throw new Error(`Password lokal ${account.role} kosong atau terlalu panjang`);
  prepared.push({...account,hash:localHash(password)});
 }
 db=await pool.connect();await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(505010)');
 for(const account of prepared){
  const matches=(await db.query('SELECT * FROM users WHERE id=$1 OR email=ANY($2::text[]) FOR UPDATE',[account.id,[account.oldEmail,account.email]])).rows;
  if(matches.length!==1)throw new Error(`Akun ${account.role} tidak ditemukan tepat satu kali; pembaruan dibatalkan`);
  const current=matches[0];
  if(current.id!==account.id||current.role!==account.role||![account.oldEmail,account.email].includes(current.email))throw new Error(`Identitas akun ${account.role} tidak cocok; pembaruan dibatalkan`);
  const collision=(await db.query('SELECT 1 FROM users WHERE email=$1 AND id<>$2',[account.email,current.id])).rowCount;
  if(collision)throw new Error(`Email tujuan akun ${account.role} sudah dipakai`);
  await db.query('UPDATE users SET email=$2,password_hash=$3,is_active=true,row_version=row_version+1,updated_at=now() WHERE id=$1',[current.id,account.email,account.hash]);
 }
 await db.query('COMMIT');
 console.info(JSON.stringify({status:'updated',accounts:prepared.map(({id,role,email})=>({id,role,email}))}));
}catch(error){if(db)await db.query('ROLLBACK').catch(()=>{});console.error('Pembaruan akun lokal dibatalkan:',error.code||error.message);process.exitCode=1;}
finally{db?.release();await pool.end();}
