import {readFile,writeFile,stat} from 'node:fs/promises';
import {createPool,requireDevelopment} from '../src/connections.js';
import {exportMasterPackage,validateMasterPackage,planMasterPackage,applyMasterPackage} from './master-transfer.js';

// Container CLI. The host wrapper mounts only a private local transfer directory.
const [command,...args]=process.argv.slice(2),options={};let pool,db;
try{
 for(let i=0;i<args.length;i+=2){
  if(!['--property','--file','--output','--plan-hash'].includes(args[i])||!args[i+1]||options[args[i]])throw new Error('invalid_transfer_arguments');
  options[args[i]]=args[i+1];
 }
 if(!['catalog','export','inspect','plan','apply'].includes(command))throw new Error('invalid_transfer_command');
 let payload;
 if(['inspect','plan','apply'].includes(command)){
  if((await stat(options['--file'])).size>20*1024*1024)throw new Error('master_package_too_large');
  payload=validateMasterPackage(JSON.parse(await readFile(options['--file'],'utf8')));
 }
 if(command==='inspect'){
  console.info(JSON.stringify({status:'master_package_valid',property_id:payload.property_id,sha256:payload.sha256,counts:Object.fromEntries(Object.entries(payload.data).map(([name,rows])=>[name,rows.length]))}));
 }else{
  requireDevelopment();pool=createPool({timeout:30000});
  if(command==='apply')console.info(JSON.stringify(await applyMasterPackage(pool,payload,options['--plan-hash'])));
  else{
   db=await pool.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   if(command==='catalog'){
    const result=await db.query(`SELECT p.id,p.name,(SELECT count(*) FROM rooms r WHERE r.property_id=p.id AND r.source='manual') AS rooms,
     (SELECT count(*) FROM devices d WHERE d.property_id=p.id AND d.source='manual') AS devices FROM properties p ORDER BY p.id`);
    console.info(JSON.stringify({properties:result.rows}));
   }else if(command==='export'){
    payload=await exportMasterPackage(db,options['--property']);
    await writeFile(options['--output'],JSON.stringify(payload),{flag:'wx',mode:0o600});
    console.info(JSON.stringify({status:'master_exported',sha256:payload.sha256,counts:Object.fromEntries(Object.entries(payload.data).map(([table,rows])=>[table,rows.length]))}));
   }else{
    const {report}=await planMasterPackage(db,payload);
    await writeFile(options['--output'],JSON.stringify(report,null,2),{flag:'wx',mode:0o600});
    console.info(JSON.stringify(report));
   }
   await db.query('COMMIT');
  }
 }
}catch(error){
 if(db)await db.query('ROLLBACK').catch(()=>{});
 // Never print raw DB messages/details: they can contain rows and password hashes.
 const code=typeof error.message==='string'&&/^[a-z_]+$/.test(error.message)?error.message:'transfer_failed';
 console.info(JSON.stringify({status:'master_transfer_failed',code}));process.exitCode=1;
}finally{db?.release();await pool?.end();}
