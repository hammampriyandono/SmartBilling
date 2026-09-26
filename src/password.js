import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify(scrypt);
const N=131072, r=8, p=1;
let busy=0;
async function key(password,salt) {
  if (busy >= 2) throw Object.assign(new Error('Password worker busy'), { status:503 });
  busy++;
  try { return await derive(password,salt,64,{N,r,p,maxmem:160*1024*1024}); }
  finally { busy--; }
}
export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password)>1024) throw new Error('Password harus 8–1024 byte');
  const salt=randomBytes(16).toString('hex');
  return `scrypt-v1:${N}:${r}:${p}:${salt}:${(await key(password,salt)).toString('hex')}`;
}
export async function verifyPassword(password,hash) {
  const match=typeof hash === 'string' && /^scrypt-v1:131072:8:1:([a-f0-9]{32}):([a-f0-9]{128})$/.exec(hash);
  const candidate=await key(password,match ? match[1] : '00000000000000000000000000000000');
  return !!match && timingSafeEqual(candidate,Buffer.from(match[2],'hex'));
}
