import test from 'node:test';
import assert from 'node:assert/strict';
import {isArchivedTestRecord,visibleAdministration,visibleHealth,visibleRecords,archivedFixtureIds} from '../src/display-policy.js';

test('arsip: semua kategori dan relasi turunan tersembunyi tanpa menebak nama atau mengubah histori',()=>{
 const data={
  readers:[{id:'reader',device_id:'test-device',source:'manual'}],
  devices:[{id:'test-device',property_id:'test-property',source:'manual'}],
  properties:[{id:'test-property',source:'simulation'},{id:'real-property',name:'Kost SIMULASI'}],
  rooms:[{id:'room',property_id:'real-property',source:'manual'}],
  tenants:[{id:'membership',user_id:'tenant',name:'Nadia Putri (contoh)',source:'manual'}],
  occupancies:[{id:'occupancy',room_id:'room',user_id:'tenant',source:'manual'}],
  cards:[{id:'92063e15-ce5c-4ef5-a872-c315a284816f',source:'manual'}]
 };
 const before=JSON.stringify(data),visible=visibleAdministration(data);
 assert.equal(visible.properties.length,1);assert.equal(visible.rooms.length,1);
 assert.equal(visible.tenants.length,1);assert.equal(visible.occupancies.length,1);
 assert.equal(visible.devices.length,0);assert.equal(visible.readers.length,0);assert.equal(visible.cards.length,0);
 assert.equal(JSON.stringify(data),before);assert.equal(visibleAdministration(data,true),data);
 for(const id of archivedFixtureIds)assert.match(id,/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
 assert.equal(isArchivedTestRecord({id:'new',source:'manual',name:'SIMULASI uji'}),false);
});

test('kesehatan: ringkasan mengikuti perangkat dan peringatan yang terlihat, tampilan arsip pulih utuh',()=>{
 const data={devices:[{id:'real',source:'manual',status:'never_seen',meters:[]},{id:'sim',source:'simulation',status:'offline',meters:[]}],
  alerts:[{device_id:'sim',status:'active'},{device_id:'real',status:'active'},{asset_id:'test',source:'simulation',status:'active'}],
  summary:{offline:1,never_seen:1,active_alerts:3}};
 const visible=visibleHealth(data);
 assert.deepEqual(visible.summary,{online:0,delayed:0,offline:0,never_seen:1,needs_review:0,active_alerts:1});
 assert.equal(visible.devices.length,1);assert.equal(visible.alerts.length,1);
 assert.equal(visibleHealth(data,true),data);assert.equal(data.alerts.length,3);
 assert.deepEqual(visibleRecords([{id:'real',source:'production'},{id:'mixed',source:'mixed'}]),[{id:'real',source:'production'}]);
});
