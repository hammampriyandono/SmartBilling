import test from 'node:test';
import assert from 'node:assert/strict';
import {calendarMonth,purchaseDate,integerRupiah} from '../src/token-summary.js';
test('token: integer Rupiah positif presisi dan tanggal/bulan kalender valid',()=>{
 assert.equal(integerRupiah('000100000'),'100000');assert.equal(integerRupiah('1000000000000'),'1000000000000');
 for(const value of [0,1000,'0','-1','1.5','1e3','1000000000001','NaN','Infinity',null,' 100'])assert.throws(()=>integerRupiah(value));
 assert.equal(calendarMonth('2026-10'),'2026-10');assert.equal(purchaseDate('2028-02-29'),'2028-02-29');
 for(const value of ['2026-02-29','2026-04-31','2026-00-01','2026-13-01','2026-10-01Z'])assert.throws(()=>purchaseDate(value));
 for(const value of ['2026-13','2026-00','2026-1','2026-10-01','1999-12',null])assert.throws(()=>calendarMonth(value));
});
