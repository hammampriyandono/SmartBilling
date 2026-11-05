import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import {docker} from './local-docker.js';

const root=resolve('.local/owner-viewer-tests',randomUUID());
await mkdir(root,{recursive:true});
await writeFile(resolve(root,'password'),randomBytes(24).toString('hex'),{flag:'wx',mode:0o600});
const mount=(from,to)=>['-v',`${resolve(from)}:${to}:ro`];
let container;
try {
  container=(await docker(['run','-d','--rm','--network','none','--tmpfs','/var/lib/postgresql/data',
    '-e','POSTGRES_USER=smartbilling_dev','-e','POSTGRES_DB=smartbilling_dev','-e','POSTGRES_PASSWORD_FILE=/run/test/password',
    ...mount(resolve(root,'password'),'/run/test/password'),'postgres:17-alpine'])).toString().trim();
  if(!/^[a-f0-9]{64}$/.test(container))throw Error('invalid_container');
  let ready=false;
  for(let attempt=0;attempt<40;attempt++) {
    try{await docker(['exec',container,'pg_isready','-U','smartbilling_dev','-d','smartbilling_dev']);ready=true;break;}
    catch{await new Promise(r=>setTimeout(r,250));}
  }
  if(!ready)throw Error('postgres_not_ready');
  const args=['run','--rm','--network',`container:${container}`,'-e','APP_ENV=development','-e','PGDATABASE=smartbilling_dev',
    '-e','PGUSER=smartbilling_dev','-e','PGHOST=127.0.0.1','-e','PGPASSWORD_FILE=/run/test/password','-e','INTEGRATION_DB=1',
    ...mount(resolve(root,'password'),'/run/test/password'),...mount('src','/app/src'),...mount('test','/app/test'),
    ...mount('web','/app/web'),...mount('scripts','/app/scripts'),...mount('migrations','/app/migrations'),
    'smartbilling-viewer-review:20261104','node'];
  console.info((await docker([...args,'scripts/migrate.js'])).toString().trim());
  console.info((await docker([...args,'scripts/migrate.js'])).toString().trim());
  const log=resolve(root,'tests.log');
  try{await docker([...args,'--test','test/owner-viewer.test.js','test/auth.test.js','test/auth-idle.test.js','test/room-relay-postgres.test.js'],{outputFile:log});}
  finally{console.info(await readFile(log,'utf8'));}
  const owner=randomUUID(),email=`${randomUUID()}@test.invalid`;
  const sql=async input=>(await docker(['exec','-i',container,'psql','-X','-tA','-U','smartbilling_dev','-d','smartbilling_dev','-v','ON_ERROR_STOP=1'],{input})).toString().trim();
  await sql(`INSERT INTO users(id,name,email,password_hash,role) VALUES('${owner}','UJI OPERATOR','${owner}@test.invalid','scrypt:inactive:test','owner');`);
  const operatorArgs=[...args],image=operatorArgs.indexOf('smartbilling-viewer-review:20261104');
  operatorArgs.splice(image,0,'-e',`VIEWER_EMAIL=${email}`,'-e',`VIEWER_OWNER_ID=${owner}`,
    '-e',`VIEWER_EXPIRES_AT=${new Date(Date.now()+86400000).toISOString()}`,'-e','VIEWER_PASSWORD_FILE=/run/test/password');
  await docker([...operatorArgs,'scripts/provision-owner-viewer.js','create']);
  const valid=await sql(`SELECT u.role='viewer' AND u.is_active AND u.password_hash LIKE 'scrypt-v1:%' AND v.owner_id='${owner}' AND v.revoked_at IS NULL FROM users u JOIN owner_viewers v ON v.user_id=u.id WHERE u.email='${email}';`);
  if(valid!=='t')throw Error('provision_viewer_invalid');
  let duplicateDenied=false;
  try{await docker([...operatorArgs,'scripts/provision-owner-viewer.js','create']);}catch{duplicateDenied=true;}
  if(!duplicateDenied)throw Error('duplicate_email_overwritten');
  for(let i=0;i<2;i++)await docker([...operatorArgs,'scripts/provision-owner-viewer.js','revoke']);
  if(await sql(`SELECT revoked_at IS NOT NULL FROM owner_viewers v JOIN users u ON u.id=v.user_id WHERE u.email='${email}';`)!=='t')throw Error('revoke_failed');
  console.info('PASS: utilitas create/revoke, hash scrypt, penolakan email duplikat dan revoke berulang.');
  console.info('PASS: viewer/auth/relay diuji pada PostgreSQL sementara tanpa jaringan luar atau volume aplikasi.');
}catch(e){console.error('Pengujian viewer terisolasi gagal:',e.message);process.exitCode=1;}
finally{if(container&&/^[a-f0-9]{64}$/.test(container))await docker(['stop',container]).catch(()=>{});}
