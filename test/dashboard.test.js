import test from 'node:test';
import assert from 'node:assert/strict';
import { allPages, chartRows, decimal, validRange, shiftDate } from '../web/data.js';

test('dashboard: seluruh halaman histori dimuat, kegagalan halaman tidak menjadi hasil lengkap', async () => {
  const urls = [], signal = new AbortController().signal;
  const result = await allPages('/api/meters/id/readings?from=a&to=b', 'next_cursor', signal, () => {}, async url => {
    urls.push(url);
    return urls.length === 1 ? { data: Array(1000).fill({ id: '1' }), next_cursor: 'page-two' } : { data: [{ id: '1001' }], next_cursor: null };
  });
  assert.equal(result.rows.length,1001); assert.equal(result.pages,2);
  assert.ok(urls[1].includes('cursor=page-two')); assert.ok(urls[1].includes('from=a'));
  let calls = 0;
  await assert.rejects(allPages('/api/meters/id/readings', 'next_cursor', signal, () => {}, async () => {
    if (calls++) throw new Error('offline');
    return { data: [{}], next_cursor: 'next' };
  }), /offline/);
});
test('dashboard: null, gap dan timestamp ambigu tidak digambar sebagai daya nol', () => {
  const rows = [
    { measured_at:'2026-09-12T00:00:00Z',power_w:null,quality:'valid' },
    { measured_at:'2026-09-12T00:01:00Z',power_w:'0',quality:'valid' },
    { measured_at:'2026-09-12T00:10:00Z',power_w:'60',quality:'valid' },
    { measured_at:'2026-09-12T00:10:00Z',power_w:'70',quality:'valid' },
  ];
  const points = chartRows(rows,120);
  assert.equal(points[0].power,null); assert.equal(points[1].power,0);
  assert.equal(points.length,5); assert.equal(points[2].power,null);
  assert.equal(points[3].power,null); assert.equal(points[4].power,null);
  assert.equal(decimal(null),'Tidak tersedia'); assert.equal(decimal('0'),'0');
});
test('dashboard: tanggal akhir inklusif dan batas 31 hari', () => {
  assert.equal(shiftDate('2026-09-30',1),'2026-10-01');
  assert.ok(validRange('2026-09-01','2026-10-01'));
  assert.equal(validRange('2026-09-01','2026-10-02'),false);
  assert.equal(validRange('2026-09-02','2026-09-01'),false);
});
