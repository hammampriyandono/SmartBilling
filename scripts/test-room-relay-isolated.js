// Ephemeral PostgreSQL: no host ports, no app volume and no real device topics.
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import {docker} from './local-docker.js';

let container;
const root=resolve('.local/room-relay-tests',randomUUID());
await mkdir(root,{recursive:true});
await writeFile(resolve(root,'password'),randomBytes(24).toString('hex'),{flag:'wx',mode:0o600});
const mount=(from,to)=>['-v',`${resolve(from)}:${to}:ro`];
try{
  container=(await docker(['run','-d','--rm','--network','none',
    '-e','POSTGRES_USER=smartbilling_dev','-e','POSTGRES_DB=smartbilling_dev','-e','POSTGRES_PASSWORD_FILE=/run/test/password',
    ...mount(resolve(root,'password'),'/run/test/password'),'postgres:17-alpine'])).toString().trim();
  if(!/^[a-f0-9]{64}$/.test(container))throw Error('invalid_container');
  let ready=false;
  for(let attempt=0;attempt<40;attempt++){
    try{await docker(['exec',container,'pg_isready','-h','127.0.0.1','-U','smartbilling_dev','-d','smartbilling_dev']);ready=true;break;}
    catch{await new Promise(resolve=>setTimeout(resolve,250));}
  }
  if(!ready)throw Error('postgres_not_ready');
  const args=['run','--rm','--network',`container:${container}`,'-e','APP_ENV=development','-e','PGDATABASE=smartbilling_dev',
    '-e','PGUSER=smartbilling_dev','-e','PGHOST=127.0.0.1','-e','PGPASSWORD_FILE=/run/test/password','-e','INTEGRATION_DB=1',
    ...mount(resolve(root,'password'),'/run/test/password'),...mount('src','/app/src'),...mount('test','/app/test'),...mount('web','/app/web'),
    ...mount('scripts','/app/scripts'),...mount('migrations','/app/migrations'),'smartbilling-expo-local-backend','node'];
  console.info((await docker([...args,'scripts/migrate.js'])).toString().trim());
  const logfile=resolve(root,'tests.log');
  try{
    await docker([...args,'--test','test/room-relay.test.js','test/room-relay-postgres.test.js','web/room-relay-data.test.js'],{outputFile:logfile});
  }finally{console.info(await readFile(logfile,'utf8'));}
  const fixture=randomUUID(),persistenceArgs=[...args];
  persistenceArgs.splice(persistenceArgs.indexOf('smartbilling-expo-local-backend'),0,'-e',`RELAY_PERSISTENCE_FIXTURE=${fixture}`);
  async function persistence(phase){const path=resolve(root,`persistence-${phase}.log`);try{await docker([...persistenceArgs,'scripts/room-relay-persistence-fixture.mjs',phase],{outputFile:path});}finally{console.info(await readFile(path,'utf8'));}}
  await persistence('before');
  await docker(['restart',container]);
  let restarted=false;
  for(let attempt=0;attempt<40;attempt++){
    try{await docker(['exec',container,'pg_isready','-h','127.0.0.1','-U','smartbilling_dev','-d','smartbilling_dev']);restarted=true;break;}
    catch{await new Promise(resolve=>setTimeout(resolve,250));}
  }
  if(!restarted)throw Error('postgres_restart_not_ready');
  await persistence('after');
  console.info('PASS: PostgreSQL relay tests isolated; no app data, device access or public port.');
}catch(error){console.error(`Relay isolated tests failed: ${error.message}`);process.exitCode=1;}
finally{if(container&&/^[a-f0-9]{64}$/.test(container))await docker(['stop',container]).catch(()=>{});}
