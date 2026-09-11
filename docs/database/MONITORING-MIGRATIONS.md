# Implementasi schema monitoring

`migrations/001_monitoring.sql` menerjemahkan subset ERD v1: users, properties, rooms, devices, communal_loads, meters, meter_readings. Belum mencakup occupancy, RFID, sesi, billing atau audit billing. ERD sumber tetap dipertahankan; dokumen ini mencatat penyesuaian implementasi, bukan persetujuan kebijakan fairness.

- Foreign key memakai RESTRICT. Role/status/jenis meter, target meter eksklusif, rentang pemasangan, nilai pengukuran nonnegatif, dan faktor daya 0–1 dibatasi.
- `meters.property_id` ditambahkan sebagai kolom pendukung FK komposit supaya device, kamar, dan fasilitas pada mapping meter harus berada di bangunan yang sama. Indeks unik `(id, property_id)` pada parent mendukung aturan tersebut.
- `btree_gist` dan exclusion constraints melarang interval pemasangan overlap pada device/channel, kamar, fasilitas, dan meter utama per bangunan. Berlaku juga bagi histori, bukan hanya record yang retired_at-nya null. Database membatasi maksimum satu meter utama pada suatu waktu; kewajiban memiliki minimal satu meter utama belum ditegakkan untuk bangunan yang sedang disiapkan.
- Mapping pemasangan meter dibuat immutable pada semua record; perubahan pemasangan membutuhkan record baru. Retirement tidak boleh mengecualikan pembacaan yang sudah tersimpan. Trigger pembacaan mengunci record pemasangan saat memeriksa batas waktunya.
- Pembacaan immutable, dengan unique `(meter_id, boot_id, sequence_no)`. Ini mencegah duplikasi row; deteksi perbedaan payload untuk identitas yang sama masih harus dilakukan ingest setelah kontrak MQTT disetujui.
- Trigger memeriksa role owner dan zona waktu bangunan. Batas kualitas semantik sensor (reset/gap) ditangani hitungan histori, bukan klaim kalibrasi hardware.
- `numeric` dan `timestamptz` mempertahankan presisi/satuan; API mempertahankan numeric sebagai string. Indeks `(meter_id, measured_at, id)` mendukung histori dan latest.
- `schema_migrations` menyimpan nama, checksum, dan waktu penerapan. Seluruh migrasi baru dijalankan dalam transaksi dengan advisory lock. Migration ulang melewati checksum yang sama; perubahan isi migration yang sudah diterapkan menggagalkan proses.

Seed hanya untuk database development `smartbilling_dev`. Akun simulasi nonaktif memiliki hash scrypt dari password acak yang tidak disimpan. Seed tidak membuat akun login atau data pengamatan. Tabel `dev_checks` dari smoke test lama tidak diubah.

Status verifikasi: sintaks JavaScript dan test dengan DB tiruan sudah dijalankan; SQL migration/constraint belum dijalankan pada PostgreSQL karena Engine Docker gagal startup. `test/database.test.js` tersedia untuk menguji constraint nyata setelah Engine pulih, dengan fixture dalam transaksi yang di-rollback. Tidak ada klaim bahwa seluruh integritas ERD sudah ditegakkan atau diuji.
