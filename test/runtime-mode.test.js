import test from 'node:test';
import assert from 'node:assert/strict';
import {dataMode,subscribedTopics} from '../src/runtime-mode.js';

test('mode operasional hanya subscribe sensor/RFID produksi; arsip mempertahankan alur pengujian',()=>{
 assert.equal(dataMode(),'archive');
 assert.deepEqual(subscribedTopics('operational','test/check'),[
  'smartbilling/v1/devices/+/readings','smartbilling/v1/devices/+/rfid/taps'
 ]);
 assert.ok(subscribedTopics('archive','test/check').includes('smartbilling/sim/v1/devices/+/readings'));
 assert.ok(subscribedTopics('archive','test/check').includes('test/check'));
 assert.throws(()=>dataMode('production-typo'),/invalid_data_mode/);
});
