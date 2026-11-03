# Memindahkan master SmartBilling dari PC ke laptop

Panduan ini memakai kode GitHub sebagai acuan, dengan alat transfer tambahan. Database Docker tidak ikut `git pull`. Paket alat berisi kode/panduan; paket master privat harus dihasilkan dari database PC yang benar-benar dipakai. Jangan memakai seed atau mengarang UUID sebagai pengganti.

## Cakupan dan jaminan

Paket v1 membawa satu properti beserta akun owner/tenant, kamar, membership, seluruh histori occupancy pada kamar terpilih, perangkat, fasilitas komunal, aset meter dan pemasangan meter. Sumber `manual` yang bukan fixture terverifikasi ikut diekspor, termasuk record yang telah berakhir/retired. Nama, UUID, `device_uid`, channel, relasi, password **hash**, versi record dan tanggal sampai microsecond dipertahankan. Tidak membatasi jumlah kamar/perangkat dalam kode.

Paket tidak membawa pembacaan sensor, event/sesi RFID, pendaftaran kartu/reader, tarif, transaksi token, tagihan, pembayaran, audit lama, invitation/token aktivasi, cookie/sesi login atau kredensial Wi-Fi/MQTT/database. Paket master bukan backup aplikasi lengkap. `last_seen_at` perangkat dibuat null karena koneksi di PC tidak membuktikan koneksi laptop; pada record laptop yang sudah identik, nilai terakhir lokal tidak ditimpa. Akun belum aktif tetap belum aktif; undangan harus diterbitkan ulang bila dibutuhkan.

Paket memuat data pribadi dan password hash. Simpan seluruh hasil di `.local/master-transfer/` yang diabaikan Git, pindahkan langsung secara privat, dan jangan menempelkan isi JSON/hash di chat/log. Checksum mendeteksi perubahan, bukan enkripsi atau tanda tangan pengirim. Pertahankan secret laptop existing; kredensial MQTT per perangkat perlu dipindahkan terpisah bila firmware memakai akun dari PC.

Impor hanya menambah record yang belum ada. Record identik dilewati. Tidak ada UPDATE, DELETE, penggantian UUID atau penyatuan berdasarkan kemiripan nama. Perbedaan pada UUID sama, email/device_uid yang sama dengan UUID berbeda, kode kamar, nomor seri, membership atau interval hunian/pemasangan menghasilkan konflik. Rencana tidak menulis database. Saat apply, database dikunci singkat dan rencana diperiksa ulang; rencana kedaluwarsa ditolak. Semua insert berada dalam satu transaksi, dengan constraint/trigger asli tetap aktif; kegagalan apa pun membatalkan seluruh insert.

## Persiapan pada PC

1. Periksa Git, AGENTS, HANDOFF, Docker dan database PC existing. Jangan mengubah data atau menimpa perubahan kerja. Kode dasar alat ini diuji terhadap main `6682dc0`, migration 001–025.
2. Jika alat belum masuk Git, bawa ZIP **alat** dari laptop dan bandingkan file sebelum menyalinnya ke root repo PC. Paket hanya mencakup scripts, tes, Compose pengujian dan panduan. Tidak memerlukan npm dependency baru atau rebuild backend operasional; wrapper memasang skrip sebagai mount read-only pada container sekali jalan.
3. Jalankan dari root repo. Perintah memakai stack `compose.expo-local.yaml`, service `postgres` dan `backend`; PostgreSQL sumber harus sudah aktif. Jangan mengarahkannya ke stack arsip/simulasi secara asumtif.

```powershell
node scripts/pc-laptop-master.js catalog
```

Perintah menampilkan ID/nama properti dan jumlah kamar/perangkat. Pilih UUID properti sebenarnya berdasarkan database PC. ID sumber tidak ditebak dari laptop atau nama properti. Untuk kebutuhan saat ini, periksa bahwa pemilihan mencakup Nadia, Rozan, dua kamar dan tiga ESP32 yang dimaksud; histori pemasangan dapat membuat jumlah record lebih besar dari jumlah perangkat aktif.

```powershell
node scripts/pc-laptop-master.js export --property UUID-PROPERTI-ASLI
node scripts/pc-laptop-master.js inspect
```

Ganti `UUID-PROPERTI-ASLI` dengan hasil katalog sebelum menjalankan. Hasil privat: `.local/master-transfer/master-private.json`. Export berjalan dalam transaksi snapshot READ ONLY, mempertahankan label asli dan menolak data yang referensinya tidak lengkap. File existing tidak ditimpa. Untuk ekspor kedua, gunakan `--package pc-master-baru.json`; gunakan nama yang sama pada inspect/plan/apply berikutnya.

Simpan ringkasan jumlah dan SHA256 yang dicetak, lalu pindahkan **file JSON privat** ke lokasi `.local/master-transfer/master-private.json` pada laptop. ZIP alat bukan file ini. Untuk akun, gunakan password yang memang berlaku pada PC; hash dalam paket tidak dipakai sebagai password login dan tidak dicetak.

## Pemeriksaan pada laptop

Kondisi terverifikasi 29 Oktober sebelum transfer: 1 owner, belum ada tenant/occupancy, 1 kamar, 2 perangkat/2 meter, 284 readings, migration terakhir023. Snapshot ini bukan jaminan kondisi tetap sama; baca ulang sebelum mutasi. Data PC pada HANDOFF tidak otomatis menjadi isi database laptop.

```powershell
node scripts/pc-laptop-master.js inspect
node scripts/pc-laptop-master.js backup
node scripts/pc-laptop-master.js plan
```

`backup` membuat dump PostgreSQL format custom secara binary-safe pada `.local/master-transfer/laptop-before-change-<UUID>.dump`, tanpa mencetak isinya. `plan` membuat `.local/master-transfer/plan.json` dengan jumlah insert/record identik/konflik, schema_matches dan hash rencana. Laporan tidak memuat nilai password hash atau salinan record. File laporan existing tidak ditimpa; gunakan `--report plan-baru.json` saat mengulang.

Jika schema berbeda, bandingkan nama/checksum migration dan pastikan kode kedua mesin sesuai. Setelah backup, jalankan migration kode saat ini melalui wrapper:

```powershell
node scripts/pc-laptop-master.js migrate
node scripts/pc-laptop-master.js plan --report plan-setelah-migrasi.json
```

`migrate` membuat backup tersendiri dahulu, lalu menjalankan runner migration existing dengan source migration repository saat ini. Tidak seed/reset atau membuat tarif/tagihan. Jangan menjalankannya hanya untuk menutupi perbedaan checksum migration lama; mismatch checksum memerlukan pemeriksaan source terlebih dahulu. Menjalankan migration adalah mutasi schema, terpisah dari rencana baca saja.

## Jika ada konflik

Berhenti sebelum apply dan periksa `conflicts`. `existing_id_differs` menyebut nama kolom yang berbeda, tanpa nilainya. `identity_or_interval_conflict` menyebut UUID yang berbenturan. Perangkat yang sama bisa memiliki UUID pemasangan berbeda karena didaftarkan terpisah di PC dan laptop. Alat tidak menukar ID historis agar konflik tampak selesai.

Jika kedua dataset punya histori dengan UUID berbeda, pilihan aman adalah menyiapkan database/stack tujuan baru untuk master PC, sementara database laptop lama tetap sebagai arsip. Pemilihan target baru dan migrasi histori membutuhkan pekerjaan terpisah setelah paket dan konflik nyata tersedia. Jangan menghapus 284 readings, menonaktifkan constraint, memodifikasi hash paket, menjalankan bootstrap target-kosong pada database existing, atau meremap ID secara otomatis.

## Apply setelah rencana bebas konflik

Gunakan laporan yang sudah diperiksa dan memiliki `can_apply=true`. Pemeriksaan ini mendeteksi konflik identitas/interval; constraint database tetap menjadi pemeriksaan terakhir untuk seluruh nilai. Paket harus berasal dari ekspor asli, bukan JSON yang diedit manual.

```powershell
node scripts/pc-laptop-master.js apply --report plan-setelah-migrasi.json
```

Wrapper membuat backup baru, lalu apply dengan hash rencana. Bila database master berubah sejak plan, apply ditolak dan perlu plan baru. Impor ulang paket yang sama menghasilkan nol insert pada master identik. Receipt privat tersimpan sebagai `import-receipt-<UUID>.json`. Tidak ada layanan aplikasi yang direbuild/recreate oleh alat ini.

Setelahnya periksa login owner/Nadia/Rozan dengan password PC, room/occupancy dan tanggalnya, tiga UID/channel/pemasangan, tenant hanya mengakses kamarnya serta meter utama ditolak untuk tenant. Pembacaan yang belum ada harus tetap kosong. Kesehatan aplikasi juga memerlukan broker aktif dan backend dengan kode/schema sesuai; keberhasilan impor bukan bukti perangkat fisik atau `/health/ready` sudah lulus.

## Jaringan dan ESP32

Firmware PC yang mengarah ke `192.168.1.9:1884` tidak otomatis mengarah ke laptop. Periksa alamat laptop saat itu, endpoint firmware terpasang, port/bind, credential tiap UID dan ACL broker. Portal Wi-Fi tidak berarti endpoint broker ikut berubah. Siapkan koneksi laptop sebagai pekerjaan tersendiri setelah impor; jangan mengganti firmware/IP/password atau membuka port/firewall hanya karena master sudah sama.

## Uji alat secara terpisah

`test/master-transfer.test.js` memiliki tes tanpa DB dan tes PostgreSQL yang wajib dua flag `INTEGRATION_DB=1`/`MASTER_TRANSFER_ISOLATED=1`. Compose `compose.master-transfer-test.yaml` memakai database tmpfs, jaringan internal, tanpa port host atau volume aplikasi. Secret tes acak disiapkan di `.local/master-transfer-test/postgres_password`; jangan memakai password production. Jalankan migration pada stack tes lalu runner. Jangan mengaktifkan flag isolated pada stack aplikasi.

Tes mencakup snapshot ekspor, penolakan simulasi/struktur asing, checksum, UUID/precision microsecond, rencana read-only, impor ulang, konflik identitas/interval/schema, perubahan setelah plan, rollback, histori target tetap, login dan batas akses tenant. Alat tidak menguji rangkaian sensor, flash atau koneksi ESP32 nyata.
