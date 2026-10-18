import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createPool,requireDevelopment} from '../src/connections.js';
import {billingObservationSql,observationSql} from '../src/display-policy.js';

test('PostgreSQL tampilan: filter billing menjaga periode utuh dan total, tanpa mengubah record',{skip:process.env.INTEGRATION_DB!=='1'},async()=>{
 requireDevelopment();const pool=createPool({timeout:15000});
 try{
  const property=randomUUID(),room=randomUUID(),simRoom=randomUUID(),occupancy=randomUUID(),user=randomUUID();
  const query={data_view:'observation'};
  const sql=`WITH rooms(id,property_id,source) AS (VALUES ($1::uuid,$3::uuid,'manual'),($2::uuid,$3::uuid,'simulation')),
   occupancies(id,user_id,room_id,source) AS (VALUES ($4::uuid,$5::uuid,$1::uuid,'manual')),
   bp(id,property_id,source,total_cost_rp) AS (VALUES (1,$3::uuid,'production',100),(2,$3::uuid,'production',200),(3,$3::uuid,'simulation',300)),
   room_bills(id,billing_period_id,room_id) AS (VALUES (1,1,$1::uuid),(2,2,$1::uuid),(3,2,$2::uuid),(4,3,$1::uuid)),
   bill_shares(room_bill_id,occupancy_id) AS (VALUES (1,$4::uuid),(2,$4::uuid))
   SELECT bp.id,bp.total_cost_rp FROM bp WHERE true`;
  const args=[room,simRoom,property,occupancy,user];
  const visible=await pool.query(sql+billingObservationSql(query)+' ORDER BY bp.id',args);
  assert.deepEqual(visible.rows,[{id:1,total_cost_rp:100}]);
  const all=await pool.query(sql+' ORDER BY bp.id',args);assert.equal(all.rows.length,3);
  assert.equal(all.rows[1].total_cost_rp,200);
  const nulls=await pool.query(`SELECT true${observationSql(query,['x.id'],['x.source'])} visible FROM (VALUES(NULL::uuid,NULL::text)) x(id,source)`);
  assert.equal(nulls.rows[0].visible,true);
 }finally{await pool.end();}
});
