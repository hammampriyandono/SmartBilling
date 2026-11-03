import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createPool,requireDevelopment} from '../src/connections.js';
import {createRoomRelayWorker} from '../src/room-relay.js';

requireDevelopment();const pool=createPool(),phase=process.argv[2],owner=process.env.RELAY_PERSISTENCE_FIXTURE;
try{
  if(phase==='before'){
    const property=randomUUID(),room=randomUUID(),device=randomUUID(),asset=randomUUID(),meter=randomUUID(),binding=randomUUID(),command=randomUUID();
    const db=await pool.connect();
    try{
      await db.query('BEGIN');
      await db.query("INSERT INTO users(id,name,email,password_hash,role) VALUES($1,'Persistence fixture',$2,'unused','owner')",[owner,`${owner}@fixture.invalid`]);
      await db.query("INSERT INTO properties(id,owner_id,name,timezone) VALUES($1,$2,'Persistence fixture','Asia/Jakarta')",[property,owner]);
      await db.query("INSERT INTO rooms(id,property_id,code,name,active_from) VALUES($1,$2,'RELAY-PERSISTENCE','Persistence fixture','2026-01-01Z')",[room,property]);
      await db.query("INSERT INTO devices(id,property_id,device_uid,status) VALUES($1,$2,$3,'active')",[device,property,`relay-persist-${owner}`]);
      await db.query("INSERT INTO meter_assets(id,property_id,label) VALUES($1,$2,'Persistence fixture')",[asset,property]);
      await db.query("INSERT INTO meters(id,property_id,meter_asset_id,device_id,room_id,kind,channel_no,installed_at) VALUES($1,$2,$3,$4,$5,'room',1,'2026-01-01Z')",[meter,property,asset,device,room]);
      await db.query('INSERT INTO room_relay_bindings(id,meter_id) VALUES($1,$2)',[binding,meter]);
      const row=(await db.query(`INSERT INTO room_relay_commands(id,binding_id,owner_id,target_boot_id,desired_state,reason,issued_at,expires_at)
        VALUES($1,$2,$3,$4,'off','Isolated persistence fixture',now()-interval '30 seconds',now()-interval '15 seconds') RETURNING *`,[command,binding,owner,randomUUID()])).rows[0];
      await db.query('INSERT INTO owner_idempotency(owner_id,request_key,request_sha256,response_data) VALUES($1,$2,$3,$4)',[owner,randomUUID(),'0'.repeat(64),{command:row}]);
      await db.query('COMMIT');
    }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
    console.info('Persistence fixture committed in isolated database.');
  }else if(phase==='after'){
    const prior=(await pool.query('SELECT response_data FROM owner_idempotency WHERE owner_id=$1',[owner])).rows[0].response_data.command;
    const row=(await pool.query('SELECT * FROM room_relay_commands WHERE owner_id=$1',[owner])).rows[0];
    assert.equal(row.id,prior.id);assert.equal(row.sequence_no,prior.sequence_no);assert.equal(row.status,'queued');
    await createRoomRelayWorker(pool,{connected:false,publish(){throw Error('Expired command must never publish');}},{enabled:true})();
    assert.equal((await pool.query('SELECT status FROM room_relay_commands WHERE id=$1',[row.id])).rows[0].status,'unconfirmed');
    assert.equal((await pool.query('SELECT count(*)::int n FROM meter_readings')).rows[0].n,0);
    console.info('PASS: command identity and idempotency survived PostgreSQL + client-process restart; expired outbox not published.');
  }else throw Error('invalid_phase');
}catch(error){console.info(JSON.stringify({fixture_error:error.code||'assertion',message:error.message}));process.exitCode=1;}
finally{await pool.end();}
