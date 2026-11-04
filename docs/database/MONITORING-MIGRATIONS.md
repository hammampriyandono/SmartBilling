# Implementasi schema monitoring

Migration033 mendukung pergantian driver/polaritas sesudah uji tanpa menulis ulang
histori: binding lama dinonaktifkan dan di-retire, binding baru tetap menargetkan
meter yang sama. Partial unique index menjaga satu binding aktif per meter.
Binding retired immutable dan tidak boleh memiliki perintah pending saat diarsipkan.
Laporan/dispatch hanya memakai binding aktif; histori API mencakup semua binding
pada meter. Utility replace memerlukan target/versi cocok, binding disabled dan
tanpa pending, mencatat audit, serta memberi binding baru versi lebih tinggi.
Migration031 tetap menjaga polaritas pada record lama. Tidak mengganti pemasangan
sensor, menghapus command atau mengubah data energi/RFID.

Migration032 menambahkan `test_until` nullable pada binding relay; existing tetap
null. Constraint memerlukan binding enabled jika batas uji diisi. Mode uji lokal
menetapkan batas15menit dan mencatat auditrelay_test, bukan verifikasihardware.
API dan worker menolak perintah sesudah batas tersebut. Penutupan akses tidak
melakukan aktuasi listrik. Tidak menambahkan atau mengubah reading/sesi RFID.

Migration031 menambahkan `gpio_on_level` pada binding relay. Default1 mempertahankan
histori HIGH=ON. Binding LOW=ON memakai0. Parser memvalidasi bentuk payload;
service mencocokkan state/GPIO dengan polaritas binding, lalu CHECK database
menegakkan pasangan yang sama. Perubahan polaritas hanya sebelum commissioning,
binding nonaktif/tanpa command, dengan status lama dikosongkan. Trigger menolak
perubahan setelah aktif/ada command; ini tidak mengubah reading atau sesi RFID.

Tambahan30Oktober2026: `028_meter_main_coverage.sql` menambahkan cakupan
`included`/`outside` pada pemasangan meter. Default existing tetap `included`.
`outside` hanya sah untuk meter komunal dan tidak dapat diubah pada record lama;
perubahan fisik memerlukan retirement dan pemasangan baru. API owner dan form
pemasangan/move mendukungnya. Meter luar tetap menyimpan pengukuran asli dan
tampil di monitoring/health; perbandingan utama/cabang, residual shared dan
tagihan fasilitas properti mengecualikannya. Ini mengikuti klarifikasi pengguna
bahwa kipas peraga RFID memiliki catu di luar meter utama dan kedua meter kamar,
bukan asumsi bahwa meter komunal selalu berada di luar. DBML sumber tidak otomatis
menegakkan aturan ini. Uji PostgreSQL mencakup default, immutability, API/move dan
tagihan yang tetap lengkap walau meter luar belum punya sampel.

Tambahan 15 September 2026: `003_running_simulator.sql` membuat `dev_checks.running_simulator`, checkpoint JSONB dengan FK meter dan waktu pembaruan, khusus utilitas simulasi berjalan. Tidak menambah field kontrak MQTT atau mengubah tabel histori. Payload pending disimpan sebelum publish agar restart bisa replay, sementara meter_readings tetap ditulis hanya oleh ingest backend.

`migrations/001_monitoring.sql` menerjemahkan subset ERD v1: users, properties, rooms, devices, communal_loads, meters, meter_readings. Belum mencakup occupancy, RFID, sesi, billing atau audit billing. ERD sumber tetap dipertahankan; dokumen ini mencatat penyesuaian implementasi, bukan persetujuan kebijakan fairness.

- Foreign key memakai RESTRICT. Role/status/jenis meter, target meter eksklusif, rentang pemasangan, nilai pengukuran nonnegatif, dan faktor daya 0–1 dibatasi.
- `meters.property_id` ditambahkan sebagai kolom pendukung FK komposit supaya device, kamar, dan fasilitas pada mapping meter harus berada di bangunan yang sama. Indeks unik `(id, property_id)` pada parent mendukung aturan tersebut.
- `btree_gist` dan exclusion constraints melarang interval pemasangan overlap pada device/channel, kamar, fasilitas, dan meter utama per bangunan. Berlaku juga bagi histori, bukan hanya record yang retired_at-nya null. Database membatasi maksimum satu meter utama pada suatu waktu; kewajiban memiliki minimal satu meter utama belum ditegakkan untuk bangunan yang sedang disiapkan.
- Mapping pemasangan meter dibuat immutable pada semua record; perubahan pemasangan membutuhkan record baru. Retirement tidak boleh mengecualikan pembacaan yang sudah tersimpan. Trigger pembacaan mengunci record pemasangan saat memeriksa batas waktunya.
- Pembacaan immutable, dengan unique `(meter_id, boot_id, sequence_no)`. Ingest simulasi kini memeriksa identitas device/channel/boot/sequence secara transaksional sebelum insert, membedakan duplikat semantik dari konflik tanpa menimpa baris.
- Trigger memeriksa role owner dan zona waktu bangunan. Batas kualitas semantik sensor (reset/gap) ditangani hitungan histori, bukan klaim kalibrasi hardware.
- `numeric` dan `timestamptz` mempertahankan presisi/satuan; API mempertahankan numeric sebagai string. Indeks `(meter_id, measured_at, id)` mendukung histori dan latest.
- `schema_migrations` menyimpan nama, checksum, dan waktu penerapan. Seluruh migrasi baru dijalankan dalam transaksi dengan advisory lock. Migration ulang melewati checksum yang sama; perubahan isi migration yang sudah diterapkan menggagalkan proses.

Seed hanya untuk database development `smartbilling_dev`. Akun simulasi nonaktif memiliki hash scrypt dari password acak yang tidak disimpan. Seed tidak membuat akun login atau data pengamatan. Tabel `dev_checks` dari smoke test lama tidak diubah.

Migration `002_mqtt_rejections.sql` diterapkan 13 September 2026: tabel penolakan dengan alasan, received_at, hash SHA-256 topik/payload, dan ukuran byte; indeks waktu untuk inspeksi. Tidak menyimpan payload mentah atau mengubah migration 001. Tidak ada penghapusan otomatis. Uji MQTT nyata memverifikasi pencatatan invalid/konflik dan invariansi isi pembacaan existing; suite PostgreSQL terbaru 10 lulus, 0 skipped.

Status verifikasi 12 September 2026: migration dan seed berhasil dijalankan pada PostgreSQL 17.11. `test/database.test.js` benar-benar dijalankan dengan INTEGRATION_DB=1; constraint overlap, deduplikasi, larangan perubahan mapping/pembacaan, batas pemasangan dan FK yang dicakup test lulus. Latest, pagination histori dan konsumsi harian juga diuji melalui API dengan fixture PostgreSQL dalam transaksi rollback. Seluruh suite: 7 lulus, 0 skipped. Ini bukan klaim bahwa seluruh integritas ERD sudah ditegakkan atau setiap constraint sudah diuji.

## Migration 029 — persiapan relay kamar

`029_room_relay.sql` menambahkan binding ke pemasangan meter kamar dan outbox perintah owner. Tidak membuat binding atau mengaktifkan perangkat existing. Trigger membatasi target ke meter kamar dan menjaga identitas binding immutable; unique index membatasi satu perintah pending. Scope owner, target tunggal/aktif, liveness, audit dan expiry juga diverifikasi service/API; DBML saja tidak menegakkan semuanya. Kontrak dan batas uji ada di [ROOM-RELAY-CONTROL.md](../ROOM-RELAY-CONTROL.md).

## Migration 030 — laporan GPIO relay

`030_room_relay_gpio.sql` menambahkan level GPIO3 nullable; tidak melakukan backfill. Constraint menolak level di luar0/1, level tanpa state, atau pasangan yang bertentangan dengan HIGH/ON–LOW/OFF yang ditetapkan pengguna. Laporan waktu/state saja tanpa GPIO tidak mengizinkan kontrol. Data sensor/PZEM tetap terpisah dan tidak diisi nol.
