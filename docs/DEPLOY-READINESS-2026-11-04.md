# Audit kesiapan Railway — 4 November 2026

## Keputusan

**Aplikasi lokal berjalan, tetapi belum siap langsung dideploy sebagai production. Push saja belum cukup.** Urutan menyiapkan cloud lebih dahulu lalu mengonfigurasi ESP satu per satu tetap dapat dipakai; adaptasi runtime dan persiapan data harus selesai sebelum layanan cloud dinyatakan siap.

Audit ini tidak melakukan commit, push, deploy, perubahan akun cloud, migrasi data atau flash. Hasil mengacu working tree lokal, layanan port3001 dan pemeriksaan remote GitHub pada waktu audit. Resource/akun Railway belum diperiksa; CLI Railway tidak ditemukan dalam PATH. Tidak adanya konfigurasi project di repo bukan bukti bahwa pengguna belum memiliki project cloud.

## Status Git

- Branch `main`, HEAD `2745dba`. Remote GitHub terverifikasi melalui `git ls-remote`: `6682dc0c7e205a7d6633cca60857c94025a88a9a`, sama dengan referensi `origin/main` lokal.
- Ada **8 commit lokal yang belum dipush**, meliputi pemindahan master, broker/perangkat, sampling/coverage, shared billing, RFID, relay, UI/merek dan panduan.
- Sebelum penambahan dokumen audit ini terdapat **15 path belum di-commit**:12berkas berubah dan3berkas baru. Termasuk perbaikan counter/akses bukti tagihan, energiWh, tarif tampilan, tombol relay serta tes. Berkas baru harus ikut ditinjau dan di-stage saat menyiapkan commit.
- Data akun, password, pemasangan perangkat, tarif, tagihan dan reading di PostgreSQL **tidak dibawa oleh Git push**. Perubahan data lokal terakhir memerlukan migrasi/bootstrap cloud tersendiri.
- Pemeriksaan nama berkas terlacak tidak menemukan `.local/`, `.env`, `secrets.h` atau binary firmware `.bin`. Arsip terlacak `firmware/pzem-dashboard.zip` berisi7entry, tanpa entry berjenis secret/header credential, password, dump atau binary. Ini pemeriksaan artefak/nama, bukan klaim secret scan menyeluruh.

## Penghalang dan persiapan production

| Bagian | Kondisi terverifikasi | Pekerjaan berikutnya |
|---|---|---|
| Startup backend | `src/server.js:22` memanggil `requireDevelopment()`. Guard menolak selain APP_ENVdevelopment/PGDATABASEsmartbilling_dev. | Pisahkan validator runtime production dari guard utilitas lokal. Jangan menyamarkan cloud sebagai development untuk melewatinya. |
| Migrasi | `scripts/migrate.js:5` memiliki guard yang sama. | Sediakan jalur migrasi production yang menjaga checksum/transaksi dan menolak seed/demo. |
| Database/secret | `src/connections.js` membaca password melalui berkas `*_FILE`; session secret juga langsung dibaca dari berkas. Belum ada adapter DATABASE_URL/environment secret production. | Tetapkan dukungan konfigurasi cloud dengan validasi dan error tersaring; pertahankan dukungan Compose lokal. |
| HTTP/HTTPS | PORT sudah dibaca, tetapi defaultBIND_HOST127.0.0.1. Origin default localhost; cookie `secure:false` dan trust proxy belum dikonfigurasi. | Gunakan bind0.0.0.0, origin HTTPS yang sebenarnya, konfigurasi proxy dan cookie Secure yang sesuai. |
| Mode data/build | Dockerfiledefault VITE_DATA_MODEarchive/NODE_ENVdevelopment; backend DATA_MODE defaultarchive. | Tetapkan build/runtimeoperational untuk cloud dan environmentproduction, dengan relay tetap nonaktif sampai commissioning. |
| Broker MQTT | Setup berjalan memakai Compose, secret/file dan endpoint laptop. Belum ada paket/config cloud yang sudah diuji. | Siapkan servicebroker, persistence, autentikasi/ACL perperangkat dan endpoint/transport yang sesuai. Bedakan port web dan MQTT. |
| Bootstrap/migrasi data | Transfer existing dibatasi development dan terutama memuat master. | Siapkan migrasi terpilih untuk master, histori nyata, sesi/tagihan yang ingin dibawa beserta relasi FK dan deduplikasi. Jangan memasukkan fixture/arsip simulasi atau sesi login lama. |

Railway menyediakan konfigurasi/secret sebagai environmentvariables dan Dockerfile perlu mendeklarasikan ARG untuk variabel saat build. Konfigurasi service, database dan broker perlu dirancang sesuai cara kerja tersebut: [Variables](https://docs.railway.com/variables), [Dockerfiles](https://docs.railway.com/builds/dockerfiles), [Express](https://railway.com/guides/express), [TCP Proxy](https://docs.railway.com/networking/tcp-proxy).

Ketiadaan `railway.toml` sendiri bukan penghalang wajib: Railway mendukung Dockerfile dan konfigurasi service. Yang belum tersedia adalah paket konfigurasi production yang lengkap dan sudah diverifikasi.

## Kualitas lokal dan pemeriksaan

- Backend, PostgreSQL dan MQTT existing healthy. GET `/health/ready` HTTP200: database/MQTT/ingest siap.
- `npm run check` lulus.
- Suite umum terbaru: **151tes,134lulus,0gagal,17dilewati**. Tes integrasi database dilewati ketika INTEGRATION_DB tidak diaktifkan; hasil ini bukan klaim seluruh integrasi telah dijalankan. Pemeriksaan terisolasi untuk perbaikan billing terbaru sebelumnya meluluskan3skenario PostgreSQL, termasuk scope evidence/finalisasi/pembayaran.
- Percobaan suite pertama dalam sandbox menghasilkan7kegagalan. Pengulangan lengkap tanpa pembatasan proses sandbox, tanpa perubahan source di antaranya, lulus134tes. Log hasil lengkap yang lulus ada di `.local/deploy-audit/tests.tap`; jangan melaporkan7kegagalan tersebut sebagai regresi aplikasi yang sudah terbukti.
- Build Vite operational dan Docker working tree terbaru `splitzbill-tenant-bill-wh:20261104` telah lulus pada pekerjaan satuanWh. Peringatan bundle besar existing tetap ada.
- Uji startup terisolasi menggunakan image tersebut, `--network none`, APP_ENVproduction/PGDATABASErailway: **server dan migrasi sama-sama exit1 karena guard development**, sebelum memerlukan secret/koneksi. Log privat `.local/deploy-audit/src-server.js.log` dan `scripts-migrate.js.log`. Ini membuktikan hambatan runtime, bukan kegagalan Railway yang sudah dideploy.

## Hal yang perlu dirapikan untuk demo

- Histori Monitoring Kamar2 masih mengikuti ID pemasangan aktif baru yang0reading. Sebanyak602reading lama tetap ada pada pemasangan sebelumnya. Dukungan histori lintas pemasangan perlu diperbaiki agar pergantian ESP tidak membuat riwayat kamar tampak hilang, dengan segmentasi counter/epoch dan pembatasan tenant tetap benar. Ini bukan penyebab startup cloud gagal, tetapi penting untuk pengalaman demo.
- ESP asli Kamar2 masih disimpan dan belum mengirim pada pemasangan aktif. Firmware perangkat masih mengarah broker laptop. Persiapan cloud dapat berjalan tanpa ESP; pengujian ingest nyata dan flash endpoint cloud dilakukan ketika board tersedia. Relay board uji tetap nonaktif; kegagalan uji relay tidak perlu menghalangi deployment dasar monitoring/billing.

## Urutan penyelesaian

1. Adaptasi konfigurasi runtime/migrasi production, HTTPS/session dan modeoperational.
2. Siapkan konfigurasi backend, PostgreSQL dan broker cloud beserta contoh variabel tanpa secret.
3. Rapikan histori lintas pemasangan dan rencana migrasi master/pengamatan nyata.
4. Uji startupproduction, migrasi database kosong, login/scope, ingest dan persistence dalam Docker terpisah; pertahankan database lokal existing.
5. Tinjau diff/artefak, commit perubahan terbaru, lalu push8commit beserta commit baru ke repo yang akan menjadi sumber deployment.
6. Deploy dan verifikasi layanan cloud. Setelah domain/port/credential broker siap, flash serta verifikasi ESP satu per satu di lokasi.

Data privat dan credential tetap di `.local/` atau secret platform; jangan dimasukkan ke commit/push maupun dokumen ini.
