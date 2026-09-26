# Kesehatan perangkat dan kualitas data

Halaman owner **Kesehatan Perangkat** membaca data nyata melalui `GET /api/owner/device-health`. Endpoint selalu membatasi hasil ke properti owner yang sedang login; tenant mendapat `403 owner_required`.

## Status dan ambang

- `online`: usia reading terakhir tidak melebihi `DEVICE_HEALTH_ONLINE_SECONDS`.
- `delayed`: melewati batas online tetapi belum melewati `DEVICE_HEALTH_OFFLINE_SECONDS`.
- `offline`: melewati batas offline.
- `never_seen`: belum pernah memiliki reading.
- `needs_review`: timestamp terakhir berada di masa depan atau ada masalah berat aktif (konflik identitas, reset/counter turun, atau timestamp invalid/ambigu).

Default development adalah 180 detik untuk online dan 900 detik untuk offline. `MONITORING_MAX_GAP_SECONDS` (default 120 detik) hanya dipakai untuk menampilkan gap; ini bukan ambang billing production yang masih menunggu interval firmware nyata.

Query menerima `from`, `to` (RFC3339, maksimum 31 hari), `device_status`, `alert_status=active|reviewed`, `device_id`, dan `room_id`. Respons berisi daftar device/meter aktif, hitungan reading valid, jumlah penolakan yang dapat diatribusikan, alert, ringkasan status, dan ambang yang sedang aktif.

## Peringatan

Peringatan berasal dari dua sumber tanpa mengubah histori:

- event ingest append-only untuk payload invalid, timestamp invalid, channel/installation salah, sequence duplikat, dan konflik identitas;
- deteksi baca-saja atas reading tersimpan untuk gap, counter epoch berubah, counter turun, timestamp ambigu, serta meter asset aktif tanpa installation aktif.

Detail hanya menyimpan reason dan metadata aman seperti nomor channel. Payload MQTT, cookie, password, token, dan secret tidak disimpan. Rejection untuk UID yang sama sekali belum terdaftar tetap ada pada `mqtt_rejections`, tetapi tidak dapat dikaitkan ke properti owner sehingga tidak ditampilkan pada halaman owner.

Owner menandai alert melalui `POST /api/owner/device-health/alerts/review` dengan body `alert_key`, `note`, dan `row_version: 0`. Aksi memerlukan CSRF dan UUID `Idempotency-Key`, memakai transaksi PostgreSQL, dan menulis audit log. Review tidak menghapus atau mengubah quality event/reading asli.

## Verifikasi lokal

```powershell
.\scripts\docker.ps1 compose run --rm --no-deps backend npm run migrate
.\scripts\docker.ps1 compose up -d --no-deps --force-recreate --wait backend
.\scripts\docker.ps1 compose exec -T -e INTEGRATION_DB=1 backend npm test
```

Untuk pemeriksaan owner read-only dengan secret lokal yang sudah tersedia, jalankan verifier di `scripts/verify-device-health-live.js` mengikuti contoh pada `LOCAL-DEVELOPMENT.md`.
