# Handoff Capstone A05

Diperbarui: 12 September 2026. Konteks awal berasal dari diskusi 9 September; lihat catatan terbaru di bawah untuk status repository terkini.

## Status awal sebelum audit repository (9 September 2026)

- Proposal 102 halaman telah dibaca dan rancangan software/database ditinjau.
- ERD v1 dibuat: 18 tabel dan 36 FK, dengan diagram, DBML, Mermaid, dan panduan.
- Belum ada web app, migration, API, broker, atau deployment yang dibuat dalam percakapan ini.
- Kondisi kode di project tujuan belum diperiksa. Pernyataan pengguna bahwa sebelumnya memakai Docker tidak membuktikan konfigurasi lokal tertentu sudah ada; periksa repository dahulu.
- Nama project yang terdaftar saat pengecekan awal adalah **Capstone A05**. Project aktif sekarang adalah **SmartBilling / Capstone A05**, `C:\Users\Admin\source\repos\SmartBilling`. Paket telah disalin ke root repository pada 10 September 2026.

## Keputusan terbaru dari pengguna

| Topik | Keputusan |
|---|---|
| Peran | Pengguna menangani fullstack; anggota lain menangani rincian bidang mereka. |
| Billing | Perhitungan berada di backend setelah data sensor diterima melalui MQTT. |
| RFID | Mulai ketika tap, selesai ketika tap lagi. |
| Infrastruktur | Railway untuk deployment; Docker digunakan sebelumnya/untuk pengembangan. |
| Pengamatan | Mengambil data selama tujuh hari, menyimpannya sebagai histori dan membandingkannya di dashboard. |
| Pendalaman aturan | Tidak membuka ulang seluruh detail fairness, hardware dan aturan lanjutan sekarang. |

Arsitektur yang telah dijelaskan dan diterima sebagai arah: ESP32 → MQTT broker → backend → PostgreSQL → API/dashboard. Jika broker ditempatkan di Railway, ESP32 menghubungi endpoint publik broker tersebut. Endpoint dashboard dan endpoint broker adalah layanan/protokol yang berbeda.

## Yang bukan keputusan final pengguna

ERD v1 memuat asumsi desain tambahan: owner menanggung kamar kosong, pembagian berdasarkan interval hunian, peserta sesi dibekukan, aturan revisi dan pembulatan. Itu bukan persetujuan eksplisit pengguna atas semua kebijakan. Pertahankan struktur yang berguna, tetapi isolasikan aturan dalam modul konfigurasi/billing dan tandai nominal sebagai estimasi bila kebijakannya belum tervalidasi. Jangan memperluas UI MVP untuk semua kemungkinan pada ERD.

Untuk RFID, tap pertama/berikutnya adalah keputusan. Perlakuan tap kartu berbeda, penggunaan bersama, debounce dan event terlambat belum dirinci. Terapkan alur satu pengguna pada simulasi awal sebagai default sementara; simpan dukungan struktur peserta banyak orang. Kasus ambigu dicatat, tidak diam-diam mengakhiri sesi pengguna lain. Selaraskan adapter dengan event firmware ketika tersedia.

## Pekerjaan pertama saat masuk repository

1. Baca AGENTS, PRD, arsitektur dan struktur repository yang ada.
2. Identifikasi stack, aplikasi, Docker, database/migration dan integrasi MQTT yang sudah dibuat.
3. Catat bagian yang bisa digunakan kembali dan bagian yang belum ada. Jangan mulai ulang proyek jika ada implementasi layak.
4. Untuk tugas implementasi, utamakan satu alur lengkap: data simulasi MQTT → database → API historis → dashboard.
5. Tambahkan login/hak akses, sesi RFID dan komponen billing sesuai milestone PRD.
6. Siapkan deployment Docker/Railway dan petunjuk uji tujuh hari. Deployment aktual mengikuti tugas yang diberikan pengguna pada saat itu.

## Bahan sumber

- Proposal asli pada mesin pengguna: `D:\Hammam\aKuliah\Capstone\Final proposal CPSTN.pdf`.
- Salinan PDF tidak dimasukkan ke paket. Ringkasan kebutuhan tersedia pada PRD; PDF dapat dibaca kembali bila path tersedia atau pengguna menaruhnya di repository.
- Paket ERD ada di `docs/database/`. Nama file bertuliskan final berarti final desain v1, bukan database yang sudah dijalankan atau persetujuan seluruh kebijakan.

## Format pembaruan handoff

Pada pekerjaan berikutnya, tambahkan tanggal dan bagian: perubahan yang benar-benar dibuat, keputusan baru, hasil pemeriksaan, keterbatasan, serta langkah berikutnya. Jangan mengubah rencana menjadi klaim pekerjaan selesai.

## Persiapan repository — 10 September 2026

### Audit dan perubahan yang dibuat

- Lokasi aktif `C:\Users\Admin\source\repos\SmartBilling`; remote `https://github.com/hammampriyandono/SmartBilling.git`, branch `main`, initial commit `f2e8b42`. Working tree bersih sebelum persiapan; hanya README dan .gitignore tersedia. Tidak dilakukan fetch, commit, atau push.
- ZIP konteks diekstrak ke direktori sementara `C:\Users\Admin\AppData\Local\Temp\capstone-a05-808ced77-a1be-48d6-99f4-f28680f0614d`. AGENTS.md dan seluruh docs disalin ke root project; tidak ada file senama yang perlu digabung pada saat penyalinan. Materi ERD dipertahankan.
- Ditambahkan backend Express minimum dengan `/health/live`, `/health/ready`, dan balasan pesan MQTT khusus pemeriksaan lingkungan. Belum ada fitur web app penuh.
- Dockerfile, compose.yaml, konfigurasi Mosquitto, `.dockerignore`, `.env.example`, aturan LF untuk shell Linux, dan pengabaian `.local/` ditambahkan. README existing dilengkapi.
- Compose mendefinisikan PostgreSQL persisten, Mosquitto persisten dengan autentikasi password, dan backend. Resource menggunakan namespace `smartbilling-a05-dev`; tidak ada penghapusan volume atau data existing.
- Utilitas `init:local` membuat secret acak lokal dan `.env` tanpa menimpa berkas existing. Wrapper PowerShell menemukan Docker per-user tanpa mengubah PATH Windows. Petunjuk lengkap ada di `LOCAL-DEVELOPMENT.md`.
- Smoke test disiapkan untuk round trip MQTT melalui backend dan tulis/baca PostgreSQL pada `smartbilling_dev.dev_checks.probes`. Penanda pengujian terpisah dari pengamatan; belum ada schema/migration 18 tabel ERD.

### Keputusan pengguna pada persiapan

- Disetujui: JavaScript, Node.js/Express baseline proposal, driver `pg` tanpa ORM, MQTT.js, Eclipse Mosquitto untuk lingkungan minimum. Frontend dan ORM aplikasi belum dipilih.
- Disetujui: backend localhost saja, PostgreSQL/MQTT hanya jaringan internal Compose, password acak dalam berkas yang diabaikan Git. Akses broker dari LAN/ESP32 belum diaktifkan.
- Keputusan produk tetap: sensor dan RFID via MQTT, perhitungan backend, sesi tap-to-tap, PostgreSQL untuk histori pengamatan tujuh hari tanpa penghapusan otomatis, Docker lokal dan Railway sebagai target. Fairness/hardware tidak menghambat persiapan.

### Hasil pemeriksaan

- Node host 22.20.0, npm 10.9.3. Dependency terpasang dan dikunci: Express 5.2.1, pg 8.23.0, MQTT.js 5.15.2. Audit npm saat instalasi melaporkan 0 vulnerabilities.
- Lulus: pemeriksaan sintaks JavaScript, impor dependency, `compose config --quiet`, pemeriksaan Git whitespace, pengabaian secret oleh Git, dan init ulang tanpa perubahan konfigurasi/secret.
- Docker Desktop 4.89.0 ditemukan di `%LOCALAPPDATA%\Programs\DockerDesktop`; CLI 29.7.2 dan Compose 5.5.0. CLI belum ada di PATH sesi ini. Ketiadaan service sistem Docker tidak membuktikan instalasi per-user tidak ada.
- WSL 2.6.1.0 dan kernel 6.6.87.2 tersedia. Ubuntu-22.04 dan docker-desktop terdaftar sebagai WSL 2, stopped saat audit. WSLService berjalan. Pemeriksaan memerlukan akses di luar sandbox; tidak ada bukti kebutuhan instalasi/aktivasi ulang WSL atau WSL1.
- Menyalakan Desktop sudah dicoba. Engine tidak tersedia pada pipe `dockerDesktopLinuxEngine`. Log startup mencatat kegagalan rename `sailor-ingest.sock` ke `.stale`: `The file cannot be accessed by the system`. Kedua socket runtime ditemukan sebagai reparse point, dan proses Docker tidak berjalan pada pemeriksaan berikutnya.
- `compose up -d --build --wait --wait-timeout 120` sudah dicoba tetapi gagal menghubungi Engine, sebelum build/run. Daftar container/volume existing juga belum dapat dibaca dari Engine. Tidak ada container/volume yang dihapus.

### Keterbatasan dan langkah berikutnya

- Pemulihan dua socket runtime Docker telah diajukan kepada pengguna; belum dijalankan saat catatan ini dibuat. Jangan menghapus volume, reset factory, atau unregister distro sebagai perbaikan rutin. Tidak ada dasar saat ini untuk menyatakan restart Windows atau instalasi ulang wajib.
- Build image, health check container, round trip MQTT runtime, dan persistensi setelah restart **belum terverifikasi** karena Engine belum siap. Ulangi langkah build/start/smoke/restart dalam `LOCAL-DEVELOPMENT.md` setelah Engine pulih.
- Backend minimum khusus development, bukan deployment produksi. Batas schema/integritas ERD, autentikasi owner/tenant, dashboard, ingest sensor, RFID, billing dan retry data produksi belum diimplementasikan.
- Belum ada integrasi ESP32, pengamatan nyata tujuh hari, atau deployment Railway. Tahap fitur berikutnya mengikuti PRD setelah lingkungan siap; detail firmware dan fairness tetap dikoordinasikan ke anggota terkait.

## Backend monitoring dan histori — 11 September 2026

### Kondisi awal dan batas kerja

- Working tree bersih saat pemeriksaan. Persiapan sebelumnya telah masuk commit existing, HEAD `a2bc58c` (`chore: add development environment configuration`), didahului `109872a` dan `da6b40e`. Commit/perubahan existing dipertahankan; tidak ada commit/push baru oleh agent pada tahap ini.
- Terverifikasi masih hanya backend health/MQTT probe, koneksi pg/MQTT.js, Docker, dan smoke test. Tidak ditemukan firmware, kontrak sensor, migration aplikasi atau API histori existing.
- Stack dipertahankan: JavaScript, Express, pg, MQTT.js, Mosquitto. Tidak menambah ORM atau dependency baru.

### Perubahan kode dan dokumentasi

- Migration `001_monitoring.sql` menambahkan tujuh tabel inti berdasarkan ERD: users, properties, rooms, devices, communal_loads, meters, meter_readings. Termasuk FK, CHECK, unique identitas pesan, indeks histori, batas mapping lintas bangunan dan interval pemasangan tidak overlap menggunakan btree_gist. Rincian/pengecualian ada di `database/MONITORING-MIGRATIONS.md`.
- Runner migration transaksional, advisory lock, checksum; seed mapping simulasi idempoten tanpa pembacaan sensor dan tanpa akun login aktif. Keduanya dibatasi database `smartbilling_dev`. Data `dev_checks` existing tidak dihapus/diubah.
- API lokal: daftar kamar/meter, latest, histori `[from,to)` dengan pagination keyset, dan konsumsi harian per zona bangunan. Batas limit 1000, rentang 31 hari, query harian maksimum 100.000 sampel. Numeric tetap string; detail API dan contoh ilustratif di `API-MONITORING.md`.
- Default bind Node langsung diperketat ke 127.0.0.1; Compose menggunakan bind dalam container dengan port host tetap 127.0.0.1. Belum ada autentikasi dan tidak siap dipublikasikan.
- Dockerfile mencakup migration/script/test, pemeriksaan sintaks mencakup seluruh JavaScript, unit/API test dan test PostgreSQL opsional ditambahkan. Semua materi ERD lama dipertahankan.

### Keputusan pengguna dan bagian yang menunggu

- **Disetujui:** aturan konsumsi harian konservatif, tanpa interpolasi, batas hari berdasarkan zona bangunan, total null jika batas hilang/reset/gap, subtotal hanya interval valid. Sampling simulasi 60 detik dan toleransi gap default 120 detik yang dapat dikonfigurasi. Bukan aturan firmware nyata.
- **Belum ada jawaban:** usulan kontrak MQTT sensor simulasi v1 di `MQTT-CONTRACT.md`. Pertanyaan telah diajukan dengan topik, contoh JSON, identitas boot/sequence/epoch, timestamp dan satuan. Karena pengguna meminta persetujuan terlebih dahulu, ingest sensor, validasi payload, penanganan invalid/konflik MQTT dan simulator **belum diimplementasikan**. Subscriber probe lama tetap tersedia.

### Hasil yang benar-benar diuji

- `npm run check`: lulus untuk semua file JavaScript.
- `npm test`: **6 lulus, 1 dilewati**. Yang lulus: validasi timestamp; API dengan database tiruan (input invalid, 404, pagination, presisi); delta desimal; hari kosong/parsial/gap; reset/rebound/timestamp ambigu; durasi hari DST dan pemutusan interval oleh kualitas invalid.
- Test constraint PostgreSQL dilewati secara eksplisit karena Engine tidak tersedia. Tersedia perintah `compose exec -T -e INTEGRATION_DB=1 backend npm test` setelah migration. Test memakai transaksi rollback tanpa penghapusan data existing.
- `compose config --quiet`: lulus. `git diff --check`: lulus; Git hanya memberi pemberitahuan konversi LF/CRLF pada beberapa file.
- Docker CLI/Compose tersedia, tetapi Engine tidak menjawab. Desktop dicoba dinyalakan lagi; log **11 September 2026 05:49 UTC** mereproduksi kegagalan rename `sailor-ingest.sock` ke `.stale` dengan `The file cannot be accessed by the system`. Tidak dilakukan pengubahan socket, factory reset, penghapusan volume, atau unregister WSL.

### Keterbatasan dan langkah berikutnya

1. Tunggu keputusan kontrak MQTT sebelum mengerjakan ingest dan simulator; persetujuan aturan harian tidak dianggap sebagai persetujuan kontrak.
2. Pemulihan Engine Docker masih diperlukan. Jika dialog error terbuka, pilih Quit, bukan factory reset. Diagnosis menunjuk socket runtime di luar repository; tindakan pemulihannya belum diizinkan. Tidak ada bukti instalasi ulang/aktivasi fitur/restart Windows wajib.
3. Setelah Engine pulih: build ulang, smoke test existing, migration, seed demo, test PostgreSQL. SQL migration, API terhadap PostgreSQL, MQTT→DB→API dan persistensi histori setelah restart **belum terverifikasi**. Jangan menyebut target alur lengkap sudah selesai.
4. Setelah kontrak disepakati: implementasikan pemetaan, validasi, deduplikasi/konflik, pencatatan invalid, simulator, dan uji alur/restart yang diminta pengguna.
5. Tetap di luar tahap: dashboard penuh, RFID, billing, deployment Railway, pengamatan tujuh hari, autentikasi produksi, commit/push.

## Pemulihan Docker Desktop — 11 September 2026, 19:29 WIB

- Pengguna meminta perbaikan error startup Docker. Working tree bersih sebelum pekerjaan pemulihan ini.
- Rename langsung socket `sailor-ingest.sock` ditolak Windows dengan error 1920. Folder induk runtime dapat dicadangkan tanpa mengakses isi socket.
- Setelah folder `Docker/run` dicadangkan, startup melewati error pertama lalu gagal pada `docker-secrets-engine/engine.sock`. Pemeriksaan folder kedua hanya menemukan `engine.sock` dan `engine.sock.stale`, keduanya socket reparse point berukuran nol; tidak ada berkas kredensial lain.
- Pemulihan berhasil setelah proses Desktop yang gagal dihentikan dan **kedua direktori runtime dicadangkan bersamaan**, kemudian dibuat ulang kosong sebelum startup. Percobaan bertahap sebelumnya meninggalkan socket baru pada direktori pertama.
- Cadangan dipertahankan di `%LOCALAPPDATA%\Docker\run.backup-20260911-192642`, `%LOCALAPPDATA%\Docker\run.backup-20260911-192916`, `%LOCALAPPDATA%\docker-secrets-engine.backup-20260911-192825`, dan `%LOCALAPPDATA%\docker-secrets-engine.backup-20260911-192916`.
- Terverifikasi: `docker version` menampilkan Server Docker Desktop 4.89.0 / Engine 29.7.2 linux/amd64; `docker info` berhasil; Compose 5.5.0 dan `compose config --quiet` berhasil. Engine melaporkan 0 container; daftar volume kosong saat diperiksa. Tidak ada container/volume yang dihapus oleh pemulihan ini.
- Tidak melakukan factory reset, unregister WSL, instalasi ulang, restart Windows, perubahan kredensial atau konfigurasi aplikasi. Docker Desktop dibiarkan berjalan.
- Pemulihan startup sudah berhasil; pengujian restart Desktop berikutnya belum dilakukan. Pola socket serupa juga dilaporkan di [Docker desktop-feedback #554](https://github.com/docker/desktop-feedback/issues/554); ini rujukan pendukung, bukan bukti penyebab awal pada mesin ini.
- Status ini menggantikan hambatan Engine pada catatan sebelumnya. Build aplikasi, migration, smoke test PostgreSQL/MQTT dan persistensi histori belum dijalankan dalam pekerjaan perbaikan Docker ini. Kontrak MQTT tetap menunggu keputusan pengguna.

## Verifikasi backend lokal — 12 September 2026

### Kondisi awal dan perbaikan

- HEAD existing `c7b8356`; perubahan dokumentasi pemulihan Docker sebelumnya pada HANDOFF dan LOCAL-DEVELOPMENT dipertahankan. Tidak melakukan commit, push, deploy, reset database atau penghapusan volume.
- Engine awalnya berhenti. Startup mereproduksi error socket pada log 12 September 08:33 UTC. Pemulihan yang sudah diizinkan diulang: kedua folder runtime dicadangkan bersamaan menjadi `%LOCALAPPDATA%\Docker\run.backup-20260912-153415` dan `%LOCALAPPDATA%\docker-secrets-engine.backup-20260912-153415`. Engine kembali berjalan. Ini pemulihan operasional; belum membuktikan bug socket tidak akan berulang setelah Desktop berhenti.
- Integration test PostgreSQL dilengkapi pemeriksaan API latest, pagination histori dua halaman, dan konsumsi harian dengan koneksi PostgreSQL nyata. Dua pembacaan fixture berada dalam transaksi yang di-rollback, sehingga tidak meninggalkan histori sensor permanen. Tidak mengimplementasikan kontrak MQTT atau simulator.

### Hasil verifikasi nyata

- `compose up -d --build --wait --wait-timeout 120`: **lulus**. Backend, PostgreSQL dan MQTT healthy. Build memakai dependency lockfile existing; tidak menambah dependency. PostgreSQL aktual 17.11.
- `compose exec -T backend npm run migrate`: **lulus**, `001_monitoring.sql` diterapkan secara transaksional.
- `compose exec -T backend npm run seed:demo`: **lulus**; 1 kamar, 3 meter (utama/kamar/komunal), akun nonaktif dan mapping demo tersedia. Seed tidak membuat pembacaan sensor.
- `compose exec -T backend npm run smoke`: **lulus**; readiness, MQTT request→backend→reply dan PostgreSQL tulis/baca probe.
- `compose exec -T -e INTEGRATION_DB=1 backend npm test`: **7 lulus, 0 gagal, 0 skipped**. Test constraint SQL, deduplikasi, immutable readings serta API dengan pembacaan fixture PostgreSQL nyata benar-benar berjalan. Hasil ini menggantikan status test PostgreSQL dilewati pada catatan sebelumnya.
- Endpoint dari host `http://127.0.0.1:3000`: `/health/live`, `/health/ready`, `/api/rooms`, `/api/meters`, `/api/meters/<meter-demo>/latest`, `/readings`, dan `/daily` semuanya **HTTP 200**.
- Readiness: database=true, mqtt=true. Daftar: 1 kamar, 3 meter. Latest demo: data=null. Histori 11–13 September: data=[]; harian 11 dan 12 September: status=no_data, total/subtotal=null, coverage=0. Ini keadaan benar karena belum ada ingest/pembacaan sensor, bukan konsumsi nol.
- `compose restart postgres mqtt backend`, kemudian `compose up -d --wait --wait-timeout 120`: **lulus**, ketiga layanan kembali healthy.
- `npm run verify:persistence` setelah restart: **lulus**, 1 probe yang dibuat sebelumnya tetap ada. Jumlah dan sidik jari kumpulan ID probe identik sebelum/sesudah restart; 1 kamar dan 3 meter tetap ada; meter_readings tetap 0. Smoke test baru setelah perbandingan juga lulus dan menambahkan probe kedua.
- `npm run check`: lulus. Tidak ditemukan kegagalan migration, seed, endpoint, atau aplikasi yang memerlukan perubahan kode produksi pada verifikasi ini.

### Batas bukti dan langkah berikutnya

- Terbukti: persistensi **probe dan mapping demo** setelah restart layanan. Belum terbukti: persistensi histori sensor permanen, karena meter_readings kosong dan fixture integration test di-rollback. Tidak menyatakan integrasi ESP32 atau MQTT sensor sudah berhasil.
- Layanan dibiarkan berjalan. Backend hanya dipublikasikan di 127.0.0.1:3000; PostgreSQL/MQTT tidak dipublikasikan ke host/LAN. API belum memiliki autentikasi.
- Usulan `MQTT-CONTRACT.md` masih menunggu persetujuan. Rekomendasi: setujui kontrak simulasi v1 untuk melanjutkan validasi/pemetaan/deduplikasi/invalid logging dan simulator tanpa hardware; penyelarasan firmware nyata tetap diperlukan. Alternatif: pengguna menyediakan kontrak firmware lebih dulu, sehingga ingest menunggu kontrak tersebut.
- Aturan konsumsi harian yang telah disetujui tidak ditanyakan ulang. Tidak mengimplementasikan bagian yang bergantung pada kontrak sebelum ada keputusan pengguna.
