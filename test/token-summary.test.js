import test from 'node:test';
import assert from 'node:assert/strict';
import {calendarMonth,purchaseDate,integerRupiah,tokenEnergy,estimateTokenEnergy} from '../src/token-summary.js';

test('token: estimasi expo memakai asumsi eksplisit, pembulatan half-up, dan batas valid',()=>{
 const example=estimateTokenEnergy('50000','1444.70','3');assert.equal(example.energy_kwh,'33.57');
 assert.deepEqual(estimateTokenEnergy('50000'),example,'nominal saja memakai konversi expo backend');
 assert.equal(example.energy_calculation.kind,'simulation_estimate');assert.equal(example.energy_calculation.tax_percent,'3');
 assert.equal(estimateTokenEnergy('100000','1444.70','3').energy_kwh,'67.14');
 assert.equal(estimateTokenEnergy('50000','1500','0').energy_kwh,'33.33');
 assert.equal(estimateTokenEnergy('1','8','0').energy_kwh,'0.13');
 assert.equal(estimateTokenEnergy('10000','100','99.99').energy_kwh,'0.01');
 for(const [amount,tariff,tax] of [['50000','0','3'],['50000','1e3','3'],['50000','1','100'],['50000','1','-1'],['50000','1','0.001'],['1','999999','99'],['1000000000000','0.0001','0'],['50000',1444.7,'3']])assert.throws(()=>estimateTokenEnergy(amount,tariff,tax));
});

test('token: kWh manual opsional, positif, presisi enam desimal tanpa pembulatan',()=>{
 assert.equal(tokenEnergy(null),null);assert.equal(tokenEnergy('00033.570000'),'33.57');
 assert.equal(tokenEnergy('0.000001'),'0.000001');assert.equal(tokenEnergy('999999999.999999'),'999999999.999999');
 for(const value of [undefined,33.57,'','0','0.000000','-1','1e3','1,5',' 1','NaN','Infinity','1.1234567','1000000000'])assert.throws(()=>tokenEnergy(value));
});
test('token: integer Rupiah positif presisi dan tanggal/bulan kalender valid',()=>{
 assert.equal(integerRupiah('000100000'),'100000');assert.equal(integerRupiah('1000000000000'),'1000000000000');
 for(const value of [0,1000,'0','-1','1.5','1e3','1000000000001','NaN','Infinity',null,' 100'])assert.throws(()=>integerRupiah(value));
 assert.equal(calendarMonth('2026-10'),'2026-10');assert.equal(purchaseDate('2028-02-29'),'2028-02-29');
 for(const value of ['2026-02-29','2026-04-31','2026-00-01','2026-13-01','2026-10-01Z'])assert.throws(()=>purchaseDate(value));
 for(const value of ['2026-13','2026-00','2026-1','2026-10-01','1999-12',null])assert.throws(()=>calendarMonth(value));
});
