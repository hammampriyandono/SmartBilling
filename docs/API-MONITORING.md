# API monitoring lokal

Status 12 September 2026: endpoint daftar, latest, histori, dan konsumsi harian telah diverifikasi HTTP 200 pada backend Docker dengan PostgreSQL 17.11. Integration test juga menguji latest, pagination histori, dan konsumsi harian dengan pembacaan fixture PostgreSQL nyata dalam transaksi rollback. Seluruh 7 test lulus, 0 skipped. Histori permanen masih kosong karena ingest dan simulator menunggu persetujuan `MQTT-CONTRACT.md`. Aturan kualitas harian sudah disetujui pengguna.

Base URL `http://127.0.0.1:3000/api`. Belum ada autentikasi. Compose mempertahankan publikasi hanya ke loopback host; saat berjalan langsung dengan Node, bind default juga loopback. Jangan membuka API ini ke LAN/internet. Semua endpoint mengembalikan metadata `source: simulation`, `environment: development`, `authenticated: false`. Backend tetap dibatasi ke database `smartbilling_dev`; database tersebut hanya untuk development, bukan pengamatan nyata.

| GET endpoint | Parameter | Hasil |
|---|---|---|
| `/rooms` | `limit`, `after` UUID opsional, `property_id` UUID opsional | Daftar kamar, `next_after` |
| `/meters` | Sama dengan rooms | Daftar meter utama/kamar/komunal, `next_after` |
| `/meters/:id/latest` | UUID meter | Pembacaan terakhir menurut waktu ukur dan ID; `data: null` bila belum ada |
| `/meters/:id/readings` | `from`, `to` wajib timestamp berzona; `limit`, `cursor` opsional | Histori terurut, `next_cursor` |
| `/meters/:id/daily` | `from`, `to` tanggal YYYY-MM-DD, akhir eksklusif, maksimum 31 hari | Konsumsi harian dan cakupan sesuai zona bangunan |

Limit default 100, maksimum 1000. Rentang histori maksimum 31 hari, menggunakan `[from,to)`; batas akhir tidak termasuk. Gunakan `next_cursor` pada permintaan berikutnya dengan meter dan rentang yang sama; cursor bukan token otorisasi. Pagination keyset memakai pasangan waktu ukur dan ID sehingga pembacaan bertimestamp sama tetap dapat dipaginasi. Histori bukan snapshot transaksi lintas permintaan: data terlambat dapat memerlukan pembacaan ulang rentang.

```powershell
Invoke-RestMethod 'http://127.0.0.1:3000/api/rooms?limit=20'
Invoke-RestMethod 'http://127.0.0.1:3000/api/meters/00000000-0000-4000-8000-000000000005/latest'
Invoke-RestMethod 'http://127.0.0.1:3000/api/meters/00000000-0000-4000-8000-000000000005/readings?from=2026-09-11T00:00:00Z&to=2026-09-12T00:00:00Z&limit=100'
```

Contoh respons ilustratif, bukan hasil pengamatan:

```json
{
  "data": [{
    "id": "1",
    "meter_id": "00000000-0000-4000-8000-000000000005",
    "boot_id": "550e8400-e29b-41d4-a716-446655440000",
    "sequence_no": "1",
    "counter_epoch": 0,
    "measured_at": "2026-09-11T00:00:00.000Z",
    "received_at": "2026-09-11T00:00:01.000Z",
    "energy_kwh": "12.345000000",
    "power_w": "100.000000",
    "voltage_v": null,
    "current_a": null,
    "frequency_hz": null,
    "power_factor": null,
    "quality": "valid"
  }],
  "next_cursor": null,
  "range": {"from":"2026-09-11T00:00:00.000Z","to":"2026-09-12T00:00:00.000Z","bounds":"[from,to)"},
  "meta": {"source":"simulation","environment":"development","authenticated":false}
}
```

Nilai numeric dan bigint disajikan sebagai string agar presisi PostgreSQL tidak hilang dalam JavaScript. `energy_kwh` adalah counter kumulatif; jangan menjumlahkannya untuk mendapat konsumsi. Field tidak tersedia tetap null. Tidak ada penggantian gap dengan nilai nol.

Error berbentuk `{ "error": "kode" }`: 400 untuk UUID, limit, cursor, timestamp/rentang invalid; 404 untuk meter tidak ditemukan; 503 bila layanan/database belum tersedia. Error database mentah dan kredensial tidak dikirim ke klien. Readiness lama memeriksa koneksi DB/MQTT, bukan status migration; jalankan migration sebelum meminta API aplikasi.

## Konsumsi harian

Contoh: `/meters/00000000-0000-4000-8000-000000000005/daily?from=2026-09-11&to=2026-09-12`.

PostgreSQL menentukan batas hari dari zona bangunan, termasuk durasi hari bila zona memakai DST. Pembacaan tepat pada akhir hari ikut sebagai batas perhitungan (berbeda dari histori mentah yang memakai akhir eksklusif). Pengurangan energi memakai integer skala 10^9 di backend, lalu dikembalikan sebagai string desimal.

Aturan disetujui: tanpa interpolasi; total hanya tersedia jika kedua batas hari ada dan seluruh interval berkualitas valid, counter konsisten, serta gap tidak melebihi `MONITORING_MAX_GAP_SECONDS` (default simulasi 120 detik). Selain itu `consumption_kwh: null`. `observed_consumption_kwh` hanya subtotal interval valid, bukan estimasi total harian. Jika tidak ada interval valid, subtotal juga null, bukan nol.

Counter berbeda epoch tidak dikurangkan. Bila counter turun dalam epoch yang sama, seluruh interval epoch tersebut pada rentang yang sedang dievaluasi dikeluarkan untuk menghindari lonjakan palsu saat counter kembali naik. Satu pembacaan sebelum rentang dibaca untuk konteks penurunan awal. Ini bukan rekonsiliasi global seluruh histori. Timestamp ganda diperlakukan ambigu dan interval yang bersentuhan dengannya tidak dihitung. Data mentah tidak diubah/dihapus oleh perhitungan ini.

Contoh satu elemen `data` untuk hari parsial (ilustrasi):

```json
{
  "date": "2026-09-11",
  "starts_at": "2026-09-10T17:00:00.000Z",
  "ends_at": "2026-09-11T17:00:00.000Z",
  "status": "partial",
  "consumption_kwh": null,
  "observed_consumption_kwh": "0.010000000",
  "coverage_seconds": 60,
  "expected_seconds": 86400,
  "sample_count": 2,
  "reasons": ["missing_start_boundary", "missing_end_boundary"]
}
```

Response metadata memuat zona, toleransi gap, dan `interpolation: false`. Query dibatasi 100.000 sampel termasuk konteks; jika terlampaui, API mengembalikan 422 `too_many_samples_shorten_range` agar klien memperpendek rentang. Data tidak dipotong diam-diam untuk menghasilkan total parsial rekaan.
