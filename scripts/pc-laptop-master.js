import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {docker,expoCompose} from './local-docker.js';

const [command,...args]=process.argv.slice(2),options={},root=resolve('.local/master-transfer');
try{
 for(let i=0;i<args.length;i+=2){
  if(!['--property','--package','--report'].includes(args[i])||!args[i+1]||options[args[i]])throw new Error('invalid_arguments');options[args[i]]=args[i+1];
 }
 if(!['catalog','export','inspect','plan','backup','migrate','apply'].includes(command))throw new Error('invalid_command');
 const packageName=options['--package']||'master-private.json',reportName=options['--report']||'plan.json';
 if([packageName,reportName].some(name=>!/^[-A-Za-z0-9_]+\.json$/.test(name))||packageName===reportName)throw new Error('invalid_private_filename');
 await mkdir(root,{recursive:true});
 async function backupDatabase(){
  const backup=join(root,`laptop-before-change-${randomUUID()}.dump`);
  await docker([...expoCompose,'exec','-T','postgres','pg_dump','-U','smartbilling_dev','-d','smartbilling_dev','-Fc'],{outputFile:backup});
  console.info(JSON.stringify({status:'database_backup_saved',path:backup}));
 }
 if(command==='backup'){
  await backupDatabase();
 }else{
 const argv=[...expoCompose,'run','--rm','--no-deps','-T','-v',`${resolve('scripts')}:/app/scripts:ro`,'-v',`${root}:/transfer`,
  '-v',`${resolve('migrations')}:/app/migrations:ro`,
  'backend','node',...(command==='migrate'?['scripts/migrate.js']:['scripts/transfer-master.js',command])];
 if(command==='migrate')await backupDatabase();
 if(command==='export')argv.push('--property',options['--property']||'', '--output',`/transfer/${packageName}`);
 if(['inspect','plan','apply'].includes(command))argv.push('--file',`/transfer/${packageName}`);
 if(command==='plan')argv.push('--output',`/transfer/${reportName}`);
 if(command==='apply'){
  const report=JSON.parse(await readFile(join(root,reportName),'utf8'));
  if(!report.can_apply||!/^[a-f0-9]{64}$/.test(report.plan_sha256||''))throw new Error('conflict_free_plan_required');
  // Native binary pipes preserve pg_dump bytes on Windows. No backup data is logged.
  await backupDatabase();
  argv.push('--plan-hash',report.plan_sha256);
 }
 const result=await docker(argv,{structuredErrors:true});console.info(result.toString().trim());
 if(command==='apply')await writeFile(join(root,`import-receipt-${randomUUID()}.json`),result,{flag:'wx',mode:0o600});
 }
}catch(error){
 const code=typeof error.message==='string'&&/^[a-z_]+$/.test(error.message)?error.message:'transfer_failed';
 console.error(JSON.stringify({status:'pc_laptop_transfer_failed',code}));process.exitCode=1;
}
