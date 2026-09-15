# Implementasi schema monitoring

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
