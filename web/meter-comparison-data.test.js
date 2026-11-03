import test from 'node:test';
import assert from 'node:assert/strict';
import {measurementDecimal} from './meter-comparison-data.js';
test('perbandingan: tampilan tidak membulatkan counter besar atau menghilangkan residual negatif kecil',()=>{
 assert.equal(measurementDecimal('99999999999.999999999'),'99.999.999.999,999999999');
 assert.equal(measurementDecimal('-0.000000001'),'-0,000000001');
 assert.equal(measurementDecimal('20.100000'),'20,1');
 assert.equal(measurementDecimal('0.000000'),'0');
 assert.equal(measurementDecimal(null),'Belum tersedia');
 assert.equal(measurementDecimal('invalid'),'Belum tersedia');
});
