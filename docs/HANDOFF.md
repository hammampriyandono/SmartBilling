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

## Ingest MQTT simulasi v1 — 13 September 2026

Status terbaru ini menggantikan status kontrak tertunda/histori kosong di atas. Pengguna menyetujui kontrak simulasi lokal v1, bukan kontrak final ESP32. Working tree bersih saat pemeriksaan awal; implementasi existing dipertahankan.

### Implementasi

- Validasi sensor, pemetaan device/channel berdasarkan waktu pemasangan, deduplikasi semantik dan konflik identitas dalam transaksi; perangkat asing tidak didaftarkan otomatis. Counter kumulatif tetap desimal presisi. Pesan invalid tidak menimpa data.
- Migration baru 002_mqtt_rejections menyimpan alasan/hash/ukuran/waktu penolakan tanpa payload mentah. Migration 001 tidak diubah.
- Subscriber tunggal sesi persisten dan callback acknowledgement setelah penyimpanan; retry DB dua detik dan readiness ingest. Simulator deterministik berlabel simulasi memakai mapping demo kamar channel 1, boot virtual tetap, 1441 sampel per hari termasuk kedua batas tengah malam Jakarta. Replay tanggal sama idempoten.
- API/daily konservatif existing dipertahankan. Dokumentasi kontrak mencatat perbedaan Arduino PubSubClient, topik rumah/kamar/kamar2/telemetry, roomId/current/voltage/power/energyWh/status; tidak membuat adapter hardware secara diam-diam.

### Pemeriksaan, masalah dan perbaikan nyata

- Engine sempat berhenti dan startup mengulangi masalah socket Windows. Pemulihan yang sebelumnya diizinkan diulang dengan pencadangan kedua direktori runtime bersamaan: %LOCALAPPDATA%\Docker\run.backup-20260913-115207 dan %LOCALAPPDATA%\docker-secrets-engine.backup-20260913-115207. Tidak menghapus volume/data. Bug startup Desktop belum terbukti pulih permanen.
- Percobaan migration pertama gagal karena dependency PostgreSQL belum berjalan; setelah compose up postgres mqtt, migration 002 dan seed demo idempoten berhasil. Build dan ketiga layanan healthy.
- Simulator pertama mengirim terlalu cepat: hanya 1113 dari 1441 sampel tersimpan sebelum timeout, konsisten dengan antrean broker terbatas. Diperbaiki menjadi batch 25 dengan barrier balasan backend serta pemeriksaan DB. Replay melengkapi sampel tanpa penghapusan; replay penuh setelah perbaikan juga lulus. Broker PUBACK bukan bukti transaksi DB selesai.
- npm run check lulus. Suite Docker dengan INTEGRATION_DB=1: **10 lulus, 0 gagal, 0 skipped**, termasuk constraint/API PostgreSQL nyata, kualitas harian, dan validasi kontrak. Test PostgreSQL tidak dilewati. Host test sebelumnya 9 lulus/1 DB skip bukan bukti utama.
- End-to-end Docker MQTT → PostgreSQL → API lulus: 1441 sampel tanggal 2026-09-12; replay/duplikat tidak menambah baris; konflik energi, JSON rusak, energi invalid, QoS 0, device asing dan channel tak terpetakan tercatat ditolak. Jumlah perangkat serta fingerprint seluruh pembacaan meter tidak berubah setelah pesan ditolak. Latest, histori pagination 1000+441, dan harian complete 1.440000000 kWh/86400 detik lulus. Smoke test probe lama juga lulus.
- Restart postgres, mqtt dan backend berhasil. **Sebelum publish ulang apa pun setelah restart**, query seluruh meter_readings menghasilkan jumlah/fingerprint row lengkap yang sama: `1441 | dbe3d06dbadc3c96ba7462148da9b74a`, baik sebelum maupun sesudah restart. Fingerprint mencakup ID dan waktu terima, bukan hanya nilai sensor. Ini bukti histori sensor permanen, bukan probe.
- Percobaan npm meneruskan --verify-only dari PowerShell tidak meneruskan flag tersebut, sehingga melakukan replay idempoten setelah perbandingan fingerprint. Verifikasi baca saja kemudian dijalankan dengan `node scripts/simulate.js 2026-09-12 --verify-only` dan lulus untuk seluruh 1441 isi sampel. Petunjuk PowerShell memakai node langsung untuk menghindari masalah penerusan opsi npm.
- Health host setelah restart: ready, database/mqtt/ingest true. API harian host: 12 September complete 1.440000000 kWh; 11 September partial (hanya satu sampel batas akhir), total dan subtotal null, coverage 0. Data tak lengkap tidak menjadi nol.

### Penggunaan dan batas berikutnya

Lihat LOCAL-DEVELOPMENT untuk perintah PowerShell; API-MONITORING memuat URL meter nyata `00000000-0000-4000-8000-000000000005`. Tanggal dataset teruji 2026-09-12. Mapping utama/komunal belum diberi pembacaan simulator.

Layanan dibiarkan berjalan pada localhost:3000; DB/broker tetap internal. Tidak ada tindakan manual wajib saat Engine aktif. Belum ada autentikasi, dashboard, RFID, billing, deployment Railway, pengamatan tujuh hari atau pengujian perangkat. Tidak melakukan commit/push/reset database/penghapusan volume.

Belum diuji: fault injection saat transaksi berjalan, gangguan panjang/antrean penuh, seluruh kemungkinan retained publish dan kompatibilitas ESP32. Sesi persisten/retry tidak menjamin tanpa kehilangan pada semua kondisi; simulator sengaja membatasi batch. Kontrak final hardware masih perlu penyelarasan identitas boot/sequence, timestamp, satuan/counter reset dan QoS bersama anggota hardware. Persetujuan simulasi tidak menetapkan keputusan firmware tersebut.

Saran pembagian commit (belum dilakukan): (1) migration penolakan + validator/ingest + lifecycle koneksi; (2) simulator + pengujian + npm scripts; (3) dokumentasi persetujuan, penggunaan, perbedaan hardware dan hasil verifikasi.

## Audit awal dashboard — 14 September 2026

- Perubahan ingest sebelumnya masih modified/untracked dan dipertahankan. AGENTS, HANDOFF, PRD, ARCHITECTURE, API dan dependency telah diperiksa; stack frontend belum ditetapkan.
- Usulan React + Vite (JavaScript), Recharts, CSS biasa, hasil build disajikan Express localhost:3000, serta polling health/latest lima detik telah diajukan. **Menunggu persetujuan pengguna**; belum memasang dependency, membuat frontend atau mengubah arsitektur.
- Audit API dan kebutuhan halaman dicatat di DASHBOARD-PLAN.md: daftar dan pilihan meter, latest, grafik dengan seluruh pagination, rentang tujuh hari, daily konservatif, label simulasi, status kosong/error/loading, serta pemisahan status backend dari usia sensor.
- API host localhost:3000 menolak koneksi. Docker CLI tersedia tetapi Engine desktop-linux tidak tersedia (pipe dockerDesktopLinuxEngine tidak ditemukan); compose ps juga gagal terhubung. Ini bukan bukti data hilang. Belum menjalankan startup/pemulihan pada tahap audit ini; ketika implementasi dilanjutkan, nyalakan/periksa Desktop sebelum build. Tidak ada reset/penghapusan data.
- Berikutnya setelah persetujuan stack: implementasikan halaman, build Docker, uji API dan browser nyata, perbarui petunjuk menjalankan. Belum ada verifikasi tampilan atau klaim sensor live. Tidak commit/push/deploy.

## Dashboard monitoring lokal — 14 September 2026

### Keputusan dan implementasi

- Pengguna menyetujui React + Vite (JavaScript), Recharts, CSS biasa, build statis melalui Express localhost:3000, serta polling health/latest lima detik. Ini menggantikan status menunggu persetujuan pada audit sebelumnya.
- web/ berisi dashboard responsif: daftar kamar/meter dan pemilihan meter, kartu V/A/W/counter kWh, waktu ukur/terima, grafik daya dengan filter tanggal dan preset tujuh hari/Dataset 12 Sep, serta tabel daily dengan total, subtotal valid, cakupan dan alasan kualitas. Seluruh data berasal dari API existing, bukan fixture di UI.
- Semua pagination daftar (next_after) dan histori (next_cursor) dituntaskan. Jumlah sampel/halaman ditampilkan; kegagalan halaman lanjutan tidak dinyatakan sukses. Grafik memakai batas waktu API daily dan memutus garis pada gap/null/kualitas invalid/timestamp ambigu. Angka koordinat grafik dikonversi hanya untuk tampilan; counter dan konsumsi tidak dihitung di frontend.
- Health backend, keberhasilan refresh browser dan usia measured_at ditampilkan terpisah. Sampel historis tetap berlabel Pembacaan lama. Polling tidak tumpang tindih, berhenti saat tab tersembunyi, dan membatalkan request lama saat meter/rentang berubah. Perubahan latest memicu refresh histori; refresh manual juga memuat data terlambat yang tidak mengubah latest. Error mempertahankan data terakhir dengan peringatan.
- Dockerfile memiliki tahap build frontend, kemudian dist disajikan Express. React 19.3.0, Recharts 3.10.1, Vite 8.3.0 dan plugin React 6.1.1 dikunci di lockfile. Tidak mengganti stack backend, kontrak MQTT, aturan daily, migration atau port jaringan. .gitignore existing sudah mengabaikan dist; .dockerignore dilengkapi untuk source web.

### Hasil nyata

- Engine awalnya tidak aktif. Startup mereproduksi error sailor-ingest.sock. Pemulihan runtime yang sebelumnya diizinkan diulang tanpa perubahan volume: %LOCALAPPDATA%\Docker\run.backup-20260914-101011 dan %LOCALAPPDATA%\docker-secrets-engine.backup-20260914-101011. Kedua folder dicadangkan bersamaan lalu dibuat kosong. Engine kembali aktif; ini bukan jaminan bug startup Desktop hilang permanen.
- Build pertama terkena TLS handshake timeout Docker Hub; retry berhasil tanpa mematikan verifikasi TLS. npm ci pada host dan build container berhasil. Build Vite lulus dengan peringatan ukuran bundle sekitar 588 kB minified / 176 kB gzip; optimasi pemisahan bundle belum dikerjakan.
- Build Compose akhir berhasil, postgres/mqtt/backend healthy. npm run check dan git diff --check lulus. Suite Docker dengan INTEGRATION_DB=1: **13 lulus, 0 gagal, 0 skipped**, termasuk PostgreSQL nyata dan tiga test helper frontend (pagination lengkap/kegagalan halaman, null/gap/timestamp ambigu, rentang tanggal). Test helper menggunakan fixture terkontrol; bukti browser di bawah memakai API nyata.
- Smoke test koneksi MQTT/DB lulus. Verifikasi baca saja 1441 sampel simulator existing lulus. Setelah build/restart backend, seluruh meter_readings tetap `1441 | dbe3d06dbadc3c96ba7462148da9b74a`, sama dengan fingerprint 13 September; histori sensor tidak diubah. Smoke hanya menambah probe pengembangan.
- Browser localhost:3000 benar-benar diverifikasi pada desktop dan viewport 390x844: daftar 1 kamar/3 meter, pemilihan meter, pergantian cepat kamar→komunal→kamar, pemilihan ulang meter aktif, dan daftar kamar yang dapat dibuka. Tidak ada luapan horizontal halaman ponsel; tabel daily dapat digeser horizontal di dalam panel.
- Kartu kamar: 220 V, 0,3 A, 60 W, counter 466,78 kWh; diukur 13 September 00:00 Jakarta, ditandai Pembacaan lama meskipun backend terhubung. Waktu refresh API terlihat berubah mengikuti polling lima detik tanpa mengubah waktu sensor.
- Dataset 12 Sep di browser: **1440 sampel histori mentah / 2 halaman**, daily **1.44 kWh, lengkap, 100%, 1441 sampel**. Perbedaan jumlah benar: histori akhir eksklusif; daily mencakup sampel batas akhir. Preset tujuh hari 8–14 September memuat 1441 sampel/2 halaman, hari kosong Tanpa data, tanggal 11 dan 13 Parsial dengan total/subtotal Tidak tersedia.
- Meter utama tanpa sampel: latest Tidak tersedia, grafik kosong, daily Tanpa data; null tidak menjadi nol. Rentang mulai setelah akhir ditolak UI dengan pesan maksimal 31 hari dan hasil aktif tidak diganti.
- Backend dihentikan sementara untuk uji error. Browser menampilkan backend tidak terjangkau dan pembaruan gagal, dengan kartu/histori terakhir tetap tersedia. Backend dinyalakan kembali; polling health/latest pulih dan refresh manual memuat seluruh histori lagi. Pesan jaringan kemudian dilokalkan ke bahasa Indonesia. Build akhir dimuat ulang; pemeriksaan log browser akhir tidak menemukan error/warning aplikasi.

### Cara mencoba dan batas bukti

Buka http://127.0.0.1:3000 dan pilih Dataset 12 Sep. Layanan dibiarkan berjalan; tab dashboard tersedia untuk pengguna. Perintah startup/build dan penggunaan ada di LOCAL-DEVELOPMENT.md; keputusan desain/alur di DASHBOARD-PLAN.md. Tidak ada tindakan manual wajib selain membuka halaman saat Engine aktif.

Belum ada simulator berkala atau pengukuran baru; pembaruan timestamp polling diuji dengan dataset existing. Pemicu refresh histori oleh ID sensor baru ditinjau pada kode, belum didemonstrasikan dengan stream sensor baru pada tahap dashboard ini. Tidak mengklaim pengamatan tujuh hari, integrasi ESP32, autentikasi produksi, uji semua browser, atau ketahanan gangguan panjang. API/broker tetap lokal/internal. Tidak commit, push, deploy, reset database atau menghapus volume/data.

Langkah berikutnya sesuai prioritas pengguna: simulator berkala dengan mapping/identitas terpisah jika diperlukan untuk demo; autentikasi dan hak akses sebelum akses di luar development; penyelarasan kontrak firmware bersama tim hardware. Hal ini belum dieksekusi.
