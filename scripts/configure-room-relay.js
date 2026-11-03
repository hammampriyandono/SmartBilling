import {parseArgs} from 'node:util';
import {createPool,requireDevelopment} from '../src/connections.js';
import {configureRoomRelay} from '../src/room-relay.js';

let pool;
try{
  const {values:v}=parseArgs({options:{'owner-id':{type:'string'},'room-id':{type:'string'},'meter-id':{type:'string'},
    'device-uid':{type:'string'},mode:{type:'string',default:'plan'},reason:{type:'string',default:''},
    'row-version':{type:'string'},'hardware-verified':{type:'boolean',default:false}}});
  requireDevelopment();pool=createPool();
  const result=await configureRoomRelay(pool,{ownerId:v['owner-id'],roomId:v['room-id'],meterId:v['meter-id'],deviceUid:v['device-uid'],
    mode:v.mode,reason:v.reason,rowVersion:v['row-version']?Number(v['row-version']):undefined,hardwareVerified:v['hardware-verified']});
  console.info(JSON.stringify(result,null,2));
}catch(error){console.error(JSON.stringify({error:error.status?error.message:'relay_configuration_failed'}));process.exitCode=1;}
finally{await pool?.end();}
