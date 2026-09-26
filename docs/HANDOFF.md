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

## Simulator berkala — 15 September 2026

### Implementasi dan keputusan rutin

- Kondisi awal Git bersih; implementasi dashboard/ingest existing dan README yang sudah diperbarui pengguna dipertahankan. AGENTS, HANDOFF, kontrak MQTT v1, PRD, ARCHITECTURE serta schema monitoring diperiksa.
- Simulator eksplisit memakai profil Compose simulation, bukan dependency/startup backend. Default lima sampel/60 detik, otomatis selesai, dapat dihentikan dengan docker stop --timeout 15. Batas jumlah 60, interval 1–3600 detik, rentang maksimal satu jam dan deadline proses satu jam. Tidak ada pembukaan port tambahan atau dependency npm baru.
- Mapping idempoten kamar SIM-RUN / **Simulasi berjalan**, device sim-running-01, channel 1, meter `00000000-0000-4000-8000-000000000105`; terpisah dari meter 0005/dataset deterministik. Runner membuat mapping hanya pada pemanggilan eksplisit dan memeriksa kesesuaian record existing. Ingest tetap tidak mendaftarkan sumber asing otomatis.
- Migration 003 menambah checkpoint development dev_checks.running_simulator, bukan perubahan kontrak sensor. Checkpoint payload/pending/sisa pembagian disimpan sebelum publish. DB confirmation membandingkan isi row; PUBACK broker saja tidak cukup. Session advisory lock mencegah proses simulator ganda. UUID boot baru tiap proses; pending dari boot lama dikirim ulang dengan identitas/isi sama. Counter tidak direset oleh restart; checkpoint hilang sementara histori tersedia menyebabkan penghentian, bukan reset.
- Model beban virtual konstan per interval: 60/120/90/180/75/150 W berulang, 220 V, PF 0,95, arus disesuaikan. Counter mengintegrasikan daya sebelumnya × waktu aktual dengan integer nano-kWh dan sisa pecahan persisten. Model menganggap beban tetap berjalan saat pengirim offline; gap tetap ditandai oleh daily backend, tidak diisi atau diestimasi frontend.
- Penanda lama dashboard diperbaiki dari pembulatan menit ke perbandingan usia milidetik langsung terhadap toleransi API (default 120 detik). Polling tetap lima detik; perubahan latest memuat ulang histori secara otomatis seperti implementasi existing.

### Pemeriksaan dan hasil nyata

- Docker semula tidak aktif; startup kembali gagal pada sailor-ingest.sock. Pemulihan yang sudah diizinkan diulang, mencadangkan kedua folder runtime ke `%LOCALAPPDATA%\Docker\run.backup-20260915-101050` dan `%LOCALAPPDATA%\docker-secrets-engine.backup-20260915-101050`. Tidak menghapus volume/reset database. Engine, build, migration 003, dan layanan healthy setelah pemulihan. Bug startup Desktop belum terbukti hilang permanen.
- Sebelum simulator: seluruh pembacaan existing `1441 | dbe3d06dbadc3c96ba7462148da9b74a`. Sesudah semua pengujian, seluruh pembacaan selain meter berjalan tetap count/fingerprint yang sama. verifyDataset 12 September juga lulus untuk isi seluruh sampel.
- Run pertama dengan default lima sampel/60 detik dihentikan eksplisit setelah tiga sampel. Tersimpan pukul 10:14:17.433, 10:15:17.462, 10:16:17.490 WIB; daya 60→120→90 W, counter 0→0.001000483→0.003001416 kWh. Interval aktual 60.029 dan 60.028 detik; counter cocok dengan interval aktual, bukan asumsi tepat 60.
- Browser benar-benar dibuka dan meter Simulasi berjalan dipilih sekali. Tanpa reload/refresh berikutnya, nilai/waktu sensor berubah dan jumlah histori bertambah 1→2→3, serta subtotal daily berubah. Total daily tetap Tidak tersedia/Parsial karena bukan hari lengkap.
- Percobaan proses kedua saat run pertama aktif ditolak dengan pesan simulator sudah berjalan. Tidak menambah sampel/mapping ganda.
- Setelah stop, browser pada 10:19:01 WIB menunjukkan **Pembacaan lama**, waktu sensor tetap 10:16:17, backend tetap terhubung. Tidak ada klik refresh untuk memperoleh perubahan status ini.
- Restart dua sampel/60 detik memakai boot berbeda: 10:19:28.141 WIB, 180 W, 0.007767691 kWh; 10:20:28.167 WIB, 75 W, 0.010768991 kWh. Browser pulih otomatis menjadi Pembacaan simulasi terbaru, histori 4→5. Run ini selesai otomatis sesuai jumlah dua sampel. Jeda restart menambahkan alasan gap pada daily dan total tetap null.
- Uji pending melalui MQTT nyata: backend dihentikan sementara, runner satu sampel menyimpan pending=true lalu tidak mendapatkan konfirmasi DB. Sebelum pemulihan, count masih 5; boot `e8297991-a944-4778-952c-87c874d2dbd6`, sequence 0, hash payload JSONB `2023e715e307c50c33b984be6a1ba1d4`. Runner telah selesai karena batas retry saat stop dicoba (container --rm sudah tidak ada), sehingga tidak mengklaim SIGTERM pada run pending ini. Setelah backend pulih dan runner dipanggil lagi, pending menjadi false, boot/sequence/hash tetap identik, dan count menjadi tepat 6. Broker redelivery/replay tidak menggandakan row.
- Hasil akhir verify-running: **6 sampel, 3 boot unik**, counter terakhir **0.012423116 kWh**. Integrasi seluruh selisih counter terhadap daya/waktu aktual lulus. Checkpoint pending=false. Semua pembacaan ditulis melalui MQTT→ingest, bukan INSERT langsung ke meter_readings dari simulator.
- Utilitas verifikasi awal sempat gagal karena Date.parse terhadap objek Date dari pg menghilangkan milidetik. Diperbaiki menjadi new Date(...).getTime(), termasuk pemeriksaan timestamp startup. Data/counter simulator benar dan tidak diubah untuk membuat test lulus.
- npm run check, build Compose dan git diff --check lulus. Suite akhir Docker INTEGRATION_DB=1: **16 lulus, 0 gagal, 0 skipped**, termasuk PostgreSQL nyata, unit model energi/restart/remainder dan replay/konflik. Uji helper replay menggunakan fixture terkontrol; bukti pending nyata dijelaskan terpisah di atas.

### Cara mencoba dan status akhir

- URL: http://127.0.0.1:3000; nama meter: **Simulasi berjalan**. Pilih tujuh hari terakhir atau rentang yang mencakup hari ini. Jika mapping baru belum ada pada daftar browser lama, klik Perbarui data sekali; pembacaan berikutnya tidak membutuhkan refresh manual.
- Run: `.\scripts\docker.ps1 compose --profile simulation run --rm -d --no-deps --name smartbilling-simulator simulator`.
- Stop: `.\scripts\docker.ps1 stop --timeout 15 smartbilling-simulator`. Container sementara --rm otomatis dibuang setelah selesai; checkpoint/histori PostgreSQL tetap disimpan. Menjalankan perintah run yang sama memulai lagi dengan counter berlanjut.
- Backend/PostgreSQL/MQTT dibiarkan healthy, simulator pengujian sudah berhenti; tidak ada pengiriman berkala tak terbatas. README dan LOCAL-DEVELOPMENT memuat langkah migration/run/stop serta verifikasi baca saja.
- Batas belum diuji: hard power loss Windows/DB saat write, gangguan broker/DB panjang atau antrean penuh, pengamatan hari lengkap dan lintas tengah malam, loncatan clock maju yang besar, perangkat ESP32 nyata. Skenario waktu mundur ditolak oleh unit test; tidak memanipulasi clock sistem untuk pengujian.
- Tidak mengubah firmware, billing, RFID, autentikasi, Railway, akses LAN; tidak commit/push/deploy, reset database, menghapus volume atau mengubah dataset lama.
- Saran pesan commit: `feat: add bounded periodic MQTT simulator with persistent checkpoints`; `fix: use exact sensor age for stale dashboard status`; `docs: document periodic simulation and verified restart results`.

### Verifikasi lanjutan pada layanan existing — 15 September 2026, 14:03 WIB

- AGENTS dan HANDOFF terbaru serta status Git diperiksa; seluruh perubahan existing dipertahankan. Backend, PostgreSQL dan MQTT sudah healthy sejak awal. Tidak menjalankan startup/pemulihan Docker, build, migration, seed, atau restart layanan.
- Kondisi awal nyata sudah tujuh sampel berjalan (terakhir 10:29:24 WIB, counter 0.031467325 kWh), bukan enam seperti akhir sesi sebelumnya. Verifikasi baca saja lulus sebelum pengiriman baru.
- Menjalankan `compose --profile simulation run --rm -d --no-deps --name smartbilling-simulator simulator 2`: jumlah dibatasi dua, interval tetap default 60 detik. Proses selesai otomatis, tidak ada simulator tertinggal berjalan.
- Tab dashboard existing sudah memilih Simulasi berjalan. Tanpa klik refresh/reload maupun mengganti meter, tampilan berubah dari Pembacaan lama menjadi Pembacaan simulasi terbaru: 14:02:17 WIB / 120 W / 0.244352858 kWh / delapan sampel, lalu 14:03:17 WIB / 90 W / 0.246353758 kWh / sembilan sampel. Histori dimuat otomatis pada 14:02:21 dan 14:03:21; total harian tetap Tidak tersedia/Parsial. Counter setelah jeda mengikuti model beban virtual offline yang sudah didokumentasikan, bukan estimasi konsumsi harian lengkap.
- `verify-running.js` lulus: sembilan sampel, lima boot; integrasi counter seluruh baris konsisten. Dataset selain meter berjalan tetap `1441 | dbe3d06dbadc3c96ba7462148da9b74a`, identik sebelum/sesudah run. Seluruh sampel baru masuk melalui publisher MQTT existing, bukan INSERT sensor langsung.
- Suite Docker dengan INTEGRATION_DB=1 kembali lulus: 16 test, 0 gagal, 0 skipped. Tiga layanan tetap healthy. Tidak ditemukan masalah kode sehingga tidak build ulang. README/petunjuk lokal diperjelas agar pengguna dengan layanan sehat langsung menjalankan simulator dan tidak mengikuti pernyataan lama bahwa simulator belum tersedia.
- Stop eksplisit, transisi lama setelah stop, dan replay pending telah diuji pada sesi sebelumnya di atas; sesi ini memverifikasi pemulihan dari pembacaan lama, dua pembaruan otomatis, dan penyelesaian otomatis. Tidak mengulang gangguan backend maupun restart persistensi. Batas hardware/ketahanan gangguan sebelumnya tetap berlaku. Tidak commit, push, reset atau menghapus volume/data.

## Audit autentikasi owner/tenant — 15 September 2026

- Pengguna meminta audit dan rekomendasi sebelum implementasi keamanan. AGENTS, PRD, ARCHITECTURE, ERD/panduannya, HANDOFF, migration, API, dashboard dan seed dibaca. Git bersih pada awal audit; hanya dokumen rencana/status diubah.
- Docker backend/PostgreSQL/MQTT healthy. Query baca saja mengonfirmasi migration 001–003 dan satu owner nonaktif; belum ada tenant, occupancies, atau session store. Percobaan psql awal memakai nama role yang keliru ditolak; pemeriksaan berikutnya memakai smartbilling_dev sesuai Compose berhasil. Tidak ada perbaikan Docker, perubahan data atau startup ulang.
- API monitoring belum memiliki autentikasi/scope pengguna; dashboard belum memiliki login atau penanganan khusus 401. Owner seed tidak memiliki password login yang diketahui. Daily mengambil sampel sebelum rentang/batas akhir sehingga otorisasi masa tinggal harus membatasi input perhitungan, tidak hanya respons.
- Usulan satu metode: express-session + connect-pg-simple, sesi PostgreSQL/cookie HttpOnly, hash scrypt asinkron Node. Aturan owner berdasarkan property.owner_id; tenant berdasarkan occupancy [starts_at,ends_at), tanpa akses utama/komunal. Masa tinggal terpisah tidak boleh menghasilkan delta lintas jeda. Kardinalitas occupancy dari ERD dan aktivasi owner demo lewat provisioning eksplisit masih usulan, bukan keputusan pengguna.
- Rencana migrasi tambahan, endpoint, parameter keamanan, provisioning dan kriteria uji tersimpan di AUTH-PLAN.md. Seluruh paket **menunggu persetujuan** sebelum dependency atau kode/schema/security diubah. Tidak memasang dependency, menjalankan test auth yang belum ada, mengubah dashboard/ingest, broker/jaringan/kontrak, atau data simulator. Tidak commit/push/deploy/reset/penghapusan volume.

## Audit sesi fasilitas RFID — 17 September 2026

- HEAD saat audit `3a96d44`; working tree awal bersih. Pengguna menyatakan autentikasi sudah selesai. Kode/migration 004–005, middleware sesi, scope owner/tenant, provisioning dan layar login sudah tersedia pada commit existing. Status menunggu autentikasi pada entri audit lama di atas bukan lagi status implementasi terkini; tidak mengulang pekerjaan autentikasi atau mengklaim pengujian ulang hari ini.
- AGENTS, PRD, ARCHITECTURE, ERD, kontrak sensor, migration, auth/access, subscriber dan simulator/seed diperiksa. Belum ada kontrak event tap atau tabel RFID/sesi dalam migration. Mapping fasilitas komunal ada dalam source seed; generator sensor existing menargetkan meter kamar.
- Docker Engine tidak tersedia saat pemeriksaan (pipe dockerDesktopLinuxEngine tidak ditemukan); audit SQL live tidak berhasil. Tidak menyalakan/memulihkan Docker, menjalankan migration/seed/simulator, atau menyatakan jumlah data live terverifikasi. Periksa kembali Engine dan fingerprint data sebelum implementasi.
- `RFID-SIMULATION-PLAN.md` memuat satu usulan kontrak v1 berlabel simulasi, identitas device/boot/sequence dan predecessor lintas restart, rencana migration/inbox/transaksi, API owner/tenant, simulator terpisah dan skenario uji. Tap-to-tap tetap keputusan produk. Satu peserta/satu fasilitas aktif, kartu lain ditolak, dan energi null tanpa bukti batas lengkap adalah **usulan yang menunggu persetujuan**.
- ERD multi-peserta/allocation equal_registered tidak dianggap persetujuan fairness. Sesi tidak ditutup otomatis oleh timer, daya, revokasi atau akhir occupancy; kasus tak sah ditandai review tanpa mengarang energi/tagihan. Kontrak final ESP32/RFID belum ditetapkan.
- Tahap ini hanya dokumentasi audit/rencana. Belum menerapkan RFID atau mengubah keamanan/broker/LAN, kontrak sensor, data simulator, billing, Railway. Tidak commit/push/reset/penghapusan volume.

## Penyelesaian backend RFID — 19 September 2026

### Implementasi

- Fokus pekerjaan hanya backend RFID, migration, API, simulator/verifier, dan dokumentasi. Perubahan frontend yang sudah ada dipertahankan tetapi tidak dipoles atau diperluas. Kontrak sensor listrik, broker/LAN, billing, Railway, dan dataset monitoring existing tidak diubah.
- Migration `006_rfid_sessions.sql` dan `007_rfid_history_guards.sql` terpasang dengan runner/checksum existing. Guard database melindungi identitas event, predecessor, konteks sesi/peserta, boundary reading, dan histori dari perubahan atau penghapusan yang dapat memindahkan makna historis.
- Ingest MQTT memvalidasi topik, QoS, retain, ukuran, JSON, dan schema; menyimpan inbox canonical; membedakan replay identik dari konflik identitas; menahan predecessor hilang; dan melanjutkan worker setelah restart. Tap valid pertama membuka sesi, tap berikutnya dari assignment kartu/fasilitas yang sama menutupnya. Kartu lain saat fasilitas sibuk ditolak tanpa mengubah sesi aktif.
- Rekonsiliasi energi hanya menghasilkan delta jika kedua boundary reading tepat dan seluruh rangkaian meter/counter valid. Boundary hilang/ambigu, gap, reset/counter turun, epoch berbeda, kualitas invalid, atau batas sampel menghasilkan `energy_kwh=null` dengan alasan. Lifecycle sesi tetap selesai oleh tap.
- Endpoint `GET /api/facilities`, `GET /api/usage-sessions`, dan `GET /api/usage-sessions/:id` memakai autentikasi existing, `no-store`, pagination/rentang terbatas, dan scope owner properti atau tenant peserta. UID serta payload event tidak dikembalikan.
- Provisioning/simulator memakai device, fasilitas, meter, checkpoint, dan topik RFID terpisah; tidak menulis ulang dataset 12 September atau checkpoint simulator monitoring berjalan.

### Verifikasi nyata

- Docker Desktop 4.89.0 kembali mengalami error `sailor-ingest.sock`. Hanya dua direktori socket runtime yang dicadangkan ke `%LOCALAPPDATA%\Docker\run.backup-20260919-170334` dan `%LOCALAPPDATA%\docker-secrets-engine.backup-20260919-170334`, lalu dibuat ulang kosong. Engine pulih; volume PostgreSQL/MQTT tidak dihapus atau direset.
- Build lockfile lulus dengan 0 vulnerability, migration idempoten lulus, provisioning RFID idempoten lulus, dan backend/PostgreSQL/MQTT healthy. `schema_migrations` memuat migration 001–007.
- Suite Docker `INTEGRATION_DB=1`: **21 lulus, 0 gagal, 0 skipped**. Cakupan RFID meliputi constraint histori, predecessor lintas boot/out-of-order, replay/konflik, kartu asing saat sibuk, status review, alasan energi konservatif, dan scope owner/tenant/asing.
- Demo nyata MQTT dua tap + tiga reading menghasilkan sesi `e462e6a9-e2c6-42b4-b14f-e20675dc71bb`, durasi 120,026 detik, status `completed`, dan energi simulasi `valid` sebesar `0.025004416` kWh.
- Verifier sebelum dan sesudah restart lulus untuk replay identik, lima replay konkuren, konflik identitas, JSON rusak, QoS salah, dan device asing. Snapshot persisten identik: 4 sesi, 8 event canonical, 1457 reading total; fingerprint reading non-RFID tetap `3e93b4b5220142a05ef009871618f8cf`.
- Restart PostgreSQL, MQTT, dan backend lulus. Dataset deterministik 12 September tetap tepat **1441** reading dan verifikasi baca-saja lulus. Simulator monitoring berjalan, smoke readiness/MQTT/DB, serta autentikasi/API dalam suite integrasi juga tetap lulus.
- Fixture test memakai transaksi rollback. Verifier invalid hanya menambah audit rejection yang diharapkan. Tidak menjalankan seed ulang, reset database, penghapusan volume, commit, push, atau deploy.

### Akun dan batas

- Akun uji existing: `owner@simulation.invalid` dan `tenant@simulation.invalid`; password dibaca dari secret lokal hasil `scripts/provision-local.ps1` dan tidak dicatat di repository. Owner/tenant tambahan pada test hanya fixture transaksi rollback.
- Endpoint dan perintah ada di `LOCAL-DEVELOPMENT.md#simulasi-sesi-rfid`. ID sesi terbaru di atas hanya berlaku pada database lokal ini.
- Belum diuji terhadap reader nyata, crash proses tepat pada setiap instruksi transaksi, gangguan broker panjang, atau banyak reader fisik bersamaan. Belum ada alur admin untuk memperbaiki chain bercabang/review atau menutup paksa sesi.
- Backend RFID selesai dan terverifikasi untuk kontrak simulasi lokal v1. Pekerjaan berikutnya yang terpisah adalah frontend **Riwayat Fasilitas** dengan Astra.

## Frontend Riwayat Fasilitas RFID — 19 September 2026

- Memeriksa AGENTS/HANDOFF terbaru, status Git, API RFID, dashboard dan helper autentikasi existing. Working tree sudah berisi implementasi backend belum di-commit; seluruh perubahan itu dipertahankan. Perubahan tahap ini hanya `web/sessions.jsx`, `web/sessions-data.js`, `web/sessions-ui.test.js`, navigasi `web/main.jsx`, CSS dan dokumentasi.
- Navigasi fasilitas tersedia untuk owner/tenant. Daftar fasilitas diambil dari API sesuai scope; tenant melihat riwayat peserta sendiri. Filter fasilitas/status/rentang WIB, tanggal akhir inklusif, preset tujuh hari, pagination cursor 10/25/50, polling lima detik, loading/error/retry/kosong serta null/zero tersedia. Tidak meminta UID/payload atau identitas peserta untuk tampilan.
- Status sesi dan alasan energi/review diterjemahkan ke bahasa Indonesia; durasi dan energi hanya memformat respons backend. Tabel desktop berubah menjadi susunan label–nilai pada ponsel. Integrasi 401/logout menggunakan AuthGate/helper existing tanpa perubahan autentikasi.
- Docker backend/PostgreSQL/MQTT sehat sejak pemeriksaan. Build Vite lulus; aset `dist` disalin ke container existing dengan `compose cp`. Tidak restart layanan, menjalankan migration/seed/simulator, atau menambah/mengubah pembacaan/sesi. Image belum dibangun ulang, sehingga container recreate dari image lama memerlukan copy aset ulang. Peringatan bundle sekitar 602 kB belum dioptimalkan.
- Pengujian frontend: **7 lulus, 0 gagal, 0 skipped** melalui `node --test web/sessions-ui.test.js test/dashboard.test.js`. Mencakup tanggal/WIB, pagination fasilitas/loop/error, null/zero, terjemahan aman, HTTP 401/session-expired dan regresi helper monitoring. Tidak menjalankan ulang test database backend pada tahap frontend.
- Browser nyata: tenant existing dan login owner menampilkan dua fasilitas/empat sesi existing; dua energi valid, dua null dengan alasan pembacaan batas hilang. Filter review kosong, filter fasilitas tanpa sesi kosong, dan tanggal 19 September satu sesi terverifikasi. Logout tenant menghapus tampilan sesi dan kembali ke login. Desktop 1280×900 serta ponsel 390×844 diperiksa termasuk keterbacaan null/alasan.
- Batas: semua empat sesi existing sudah selesai; baris aktif/review dan navigasi halaman kedua sesi belum dapat dibuktikan dengan dataset nyata tanpa menambah data. Error/401 dan pagination fasilitas diuji helper; tidak memutus layanan untuk uji browser. Kedua akun demo berhak atas sesi yang sama; isolasi akun asing mengacu bukti backend sebelumnya, bukan klaim uji baru.
- URL: http://127.0.0.1:3000 → **Riwayat fasilitas RFID**. Akun `owner@simulation.invalid` / `tenant@simulation.invalid` memakai password secret lokal existing, tidak dicetak atau diubah. Petunjuk lengkap: `FRONTEND-RFID.md`. Tidak commit, push, deploy, akses LAN, reset atau penghapusan volume.

## Backend manajemen data master — 21 September 2026

- Ditambahkan migration baru 008–011 tanpa mengubah 001–007: audit append-only, optimistic concurrency, klasifikasi source, aset meter fisik terpisah, guard lifecycle, membership properti, invitation token hash, serta backfill aman.
- Backfill hanya menambah metadata/aset/membership yang menunjuk record existing. Tidak membuat akun, occupancy, reading, event, tap, atau sesi. Data simulasi ditandai read-only bagi CRUD owner.
- API `/api/owner` mencakup kamar, fasilitas, device, meter asset, meter installation, reader, kartu, tenant invitation, occupancy/end/move. Mutasi memakai CSRF, ownership check, transaksi, reason, audit, dan `row_version`.
- Tenant baru diundang dengan token sekali pakai yang hanya disimpan sebagai hash; aktivasi menetapkan password scrypt dan mengaktifkan membership. Email existing ditolak untuk mencegah pengambilalihan akun lintas owner.
- Move occupancy atomik menutup occupancy lama dan membuat record baru. Replace kartu dan move meter installation juga menutup record lama serta membuat record baru; histori tidak dipindahkan.
- Docker Desktop kembali mengalami error socket; runtime dicadangkan ke `%LOCALAPPDATA%\Docker\run.backup-20260921-093811` dan `%LOCALAPPDATA%\docker-secrets-engine.backup-20260921-093811`. Volume tidak disentuh.
- Suite integrasi PostgreSQL final setelah seluruh operasi lifecycle: **22/22 lulus tanpa skip**. Fingerprint histori setelah migration identik dengan baseline: sesi `45732f4a2093e38b28ffe5e0706cde6e`, event `71b085ebafe2e3aad388f23b4d3f7fb3`, readings `1e58cd31a8eff1d6c0d8a434cbcbb54a`.
- Restart PostgreSQL, MQTT dan backend lulus; semua container kembali healthy. Dataset deterministik 1441 sampel, snapshot fingerprint, autentikasi, RFID, dan smoke MQTT/DB tetap lulus setelah restart.
- Detail endpoint dan batas ada di `MASTER-DATA-BACKEND.md`. Tidak membuat UI admin, commit, push, deploy, reset database, atau menghapus volume.

## Frontend Administrasi owner — 21 September 2026

- Audit API owner menemukan idempotency key belum disimpan/divalidasi. Pengguna memilih **tunda mutasi sampai backend mendukung idempotensi**. Tahap ini baca-saja; create/update/lifecycle/invitation/token/CSRF mutasi/stale_version belum diimplementasikan atau diuji. Backend tidak diubah untuk melengkapinya.
- Navigasi/component guard owner, ringkasan sembilan kategori, daftar, pencarian/filter lokal, pagination tampilan, detail field aman, label simulasi/manual, status temporal dan versi record tersedia. Semua request Administrasi GET dengan header akun existing dan abort saat unmount; tidak ada penyimpanan persisten browser.
- Enam daftar API diikuti cursor after; tenant/occupancy/kartu belum dipaginasi API. Semua halaman kategori dimuat sebelum pencarian/pagination lokal, hasil parsial ditolak saat gagal. Detail berasal dari respons daftar; tidak menambah endpoint/kontrak.
- Layanan sudah healthy. Build Vite lulus; hanya copy aset dist ke container berjalan, tidak rebuild image/restart/migration/seed/simulator. Peringatan bundle sekitar 616 kB belum dioptimalkan; recreate image lama memerlukan copy aset ulang.
- Test frontend **12 lulus, 0 gagal, 0 skipped**. Browser owner memuat 2 kamar, 1 tenant, 2 occupancy, 1 kartu, 2 fasilitas, 3 device, 5 aset meter, 5 pemasangan, 1 reader. Detail kartu tanpa UID, pencarian kosong, logout, desktop/ponsel diperiksa. Browser tenant tidak memiliki Administrasi; sembilan GET owner dengan akun tenant ditolak 403, tanpa sesi 401.
- Histori sebelum/sesudah identik: sesi 4/`45732f4a2093e38b28ffe5e0706cde6e`, event 8/`71b085ebafe2e3aad388f23b4d3f7fb3`, reading 1457/`1e58cd31a8eff1d6c0d8a434cbcbb54a`. Tidak ada mutasi master/histori; login/logout memakai sesi auth existing.
- URL http://127.0.0.1:3000 → Administrasi; akun owner/tenant demo memakai secret lokal existing. Panduan/batas/rencana mutasi: `FRONTEND-ADMIN.md`. Data kurang dari sepuluh record per kategori; halaman kedua tampilan belum diuji browser, pagination/error/401 diuji helper dan akses 403/401 lewat HTTP nyata.
- Perubahan hanya frontend admin/main/CSS/test dan dokumentasi. Perubahan backend/migration/auth existing dipertahankan. Tidak commit/push/deploy/LAN/reset/penghapusan volume. Mutasi menunggu dukungan idempotensi backend sesuai keputusan pengguna, bukan dianggap selesai.

## Idempotency mutasi owner — 21 September 2026

- Migration `012_owner_idempotency.sql` menambah catatan append-only per `(owner_id, request_key)`; mutation dan hasil dicatat dalam transaksi yang sama dengan audit existing. Migration 001–011 tidak diubah.
- Seluruh POST/PATCH `/api/owner` sekarang memerlukan `Idempotency-Key` UUID setelah autentikasi owner dan CSRF. HMAC method+URL+payload mencegah key sama dipakai untuk permintaan lain. Advisory lock transaksi menolak retry yang masih diproses dengan 409 tanpa menjalankan mutasi kedua.
- Hasil sukses tersimpan dan direplay setelah proses/router baru. Undangan tenant mengembalikan token sama pada retry dengan HMAC secret server; token mentah tidak disimpan di idempotency/audit, tabel invitation tetap menyimpan hash. Secret sesi lokal harus dipertahankan lintas restart.
- Test PostgreSQL nyata memakai fixture rollback untuk retry create, konflik payload/endpoint, undangan, move occupancy, replace kartu, move pemasangan meter, audit tunggal, dan inisialisasi ulang router. Test dua koneksi nyata membuktikan retry paralel langsung menerima `idempotency_in_progress` tanpa mutasi.
- Verifikasi akhir: `npm run check`, `git diff --check`, build Docker, migration 012, dan suite PostgreSQL **23/23 lulus tanpa skip**. PostgreSQL, MQTT, dan backend direstart; semuanya kembali healthy. Fingerprint tetap identik sebelum/sesudah restart: 4 sesi `45732f4a2093e38b28ffe5e0706cde6e`, 8 event `71b085ebafe2e3aad388f23b4d3f7fb3`, 1457 readings `1e58cd31a8eff1d6c0d8a434cbcbb54a`. Dataset 1441 sampel dan smoke MQTT/DB lulus.
- Replay hasil terkomit setelah inisialisasi ulang router teruji memakai transaksi fixture. Uji tambahan 21 September melakukan **restart fisik backend** di antara POST `/api/owner/rooms` dan retry identik: keduanya HTTP 201 dengan respons yang sama, sedangkan PostgreSQL tetap memiliki tepat satu kamar dan satu audit untuk aksi itu. Fixture permanen sengaja dipisah pada properti `da7a96ec-b738-435e-a617-3a20855edda1` bernama `UJI IDEMPOTENSI — bukan data pengamatan`, tanpa meter, pembacaan, tap atau sesi. Tidak ada reset/penghapusan data. Verifier: `scripts/verify-owner-idempotency-restart.js before|after`.
- Setelah restart tersebut, suite PostgreSQL nyata tetap **23/23 lulus tanpa skip**. Fingerprint sebelum/sesudah tetap sama: 4 sesi `45732f4a2093e38b28ffe5e0706cde6e`, 8 event `71b085ebafe2e3aad388f23b4d3f7fb3`, 1457 readings `1e58cd31a8eff1d6c0d8a434cbcbb54a`, serta 1450 reading non-RFID `3e93b4b5220142a05ef009871618f8cf`.
- Frontend administrasi tidak diubah dan tetap baca-saja. Detail kontrak ada di `MASTER-DATA-BACKEND.md`. Tidak ada commit/push/reset/penghapusan volume.

## Frontend mutasi Administrasi owner — 22–23 September 2026

- Melanjutkan working tree frontend dari mode baca-saja setelah persetujuan pengguna dan backend idempotensi selesai. File baru web/admin-form.jsx, admin-mutations.js, admin-mutations.test.js; integrasi admin.jsx/CSS. Tidak mengubah backend, migration, auth, MQTT, simulator, billing atau kontrak perangkat.
- Form create untuk sembilan kategori (tenant melalui invitation), edit nama kamar sesuai API, deactivate/revoke/retire/replace/move/end tersedia. API tidak memiliki edit umum kategori lain. Reason, CSRF, X-Account-ID, row_version pada existing record, dan UUID key per aksi diterapkan.
- Snapshot key/body/versi immutable di memori, klik ganda dicegah, timeout/5xx/in-progress/CSRF memiliki retry key sama. Stale version dan key conflict meminta peninjauan ulang. Token invitation hanya pada layar sukses yang terbuka; close/unmount/logout membuang state. UID input tersamarkan dan record API diproyeksikan tanpa secret. Tenant guard tetap berlaku.
- Perbaikan selama uji: presisi tanggal sampai detik, validasi akhir setelah awal, default ends_at opsional kosong, input/change datetime tidak kembali ke default, 403/404 non-JSON tetap dikategorikan benar, respons aborted tidak mengganggu sesi baru.
- Build final Vite lulus (warning bundle ~629 kB), git diff --check bersih. Aset disalin ke container existing; image tidak rebuild, recreate image lama perlu copy ulang. Ketiga layanan healthy. Pada 22 September Engine sempat belum tersedia, lalu pulih lewat startup normal; tidak reset. Pada 23 September backend dijeda 45 detik untuk timeout, kemudian otomatis unpause.
- **19 test frontend lulus, 0 skip**; **2 test master PostgreSQL existing lulus, 0 skip**, fixture rollback. Browser nyata 22–23 September: create/edit kamar, stale_version dua tab, nonaktif kamar/fasilitas/device, tambah fasilitas/device/aset/pemasangan/reader/kartu, move/retire pemasangan, retire aset/reader, replace/revoke kartu, invitation sekali tampil, create/end occupancy pada interval Agustus tanpa meter. Desktop 1280×900 dan ponsel 390×844 diperiksa.
- Timeout browser terjadi ketika pengambilan CSRF selama backend pause; form terkunci, retry berhasil setelah pulih. Kamar UI-2309-TIMEOUT terbukti satu record, satu audit create dan satu hasil idempotensi. Bukan bukti browser response-lost setelah commit; skenario itu diuji helper dan replay terkomit oleh test PostgreSQL.
- Form move occupancy telah diperiksa, tetapi sukses browser belum diuji karena tenant aktif existing memiliki masa tinggal lain. Tidak mengubah interval existing/aktivasi akun untuk memaksakan fixture. Body move diuji helper; atomic move lulus di PostgreSQL rollback. Error in-progress/key-conflict/CSRF diuji helper/API, belum browser fault injection.
- Logout dan browser tenant diuji: tidak ada menu/form Administrasi. HTTP tenant sembilan GET owner serta satu POST owner ditolak 403; tanpa sesi 401. **Temuan penting backend existing:** masterApi terpasang pada /api dengan guard owner global sebelum router monitoring/RFID; tenant /api/rooms, /api/meters dan /api/facilities juga menghasilkan 403 owner_required. Tidak diperbaiki karena scope frontend melarang backend. Tindak lanjut: batasi guard ke route /owner dan uji mounting aplikasi lengkap. Jangan mengklaim monitoring tenant sehat.
- Fingerprint histori akhir identik dengan baseline: sesi 4/45732f4a2093e38b28ffe5e0706cde6e, event 8/71b085ebafe2e3aad388f23b4d3f7fb3, readings 1457/1e58cd31a8eff1d6c0d8a434cbcbb54a, non-RFID 1450/3e93b4b5220142a05ef009871618f8cf. Record master uji permanen dibuat melalui UI, berlabel UJI UI 22/23 Sep; tidak dihapus. Invitation ui-owner-2209@simulation.invalid belum aktif dan token tidak disimpan.
- Panduan, kemampuan API, cara mencoba, perintah build/test, fixture dan batas ada di FRONTEND-ADMIN.md; README serta LOCAL-DEVELOPMENT diperbarui. URL http://127.0.0.1:3000/ → Administrasi, login owner demo menggunakan secret existing. Tidak commit/push/deploy/LAN/reset/penghapusan volume. Pekerjaan frontend selesai dengan batas pengujian dan bug backend di atas dicatat untuk tindak lanjut terpisah.

## Perbaikan routing tenant dan owner — 24 September 2026

- Penyebab terkonfirmasi: guard role pada root `masterApi` dieksekusi untuk semua request `/api` sebelum router monitoring/RFID. Guard dipindahkan ke subpath `/owner`; seluruh URL API dan urutan router tetap sama. Tidak mengubah frontend, migration, kontrak MQTT, data master, billing, simulator atau histori.
- Regression test baru memasang master router di `/api` seperti aplikasi lengkap dan membuktikan tenant diteruskan untuk `/rooms`, `/meters`, `/facilities`, `/usage-sessions`, sedangkan GET `/api/owner`, GET `/api/owner/rooms`, dan POST `/api/owner/rooms` tetap `403 owner_required`.
- Verifier HTTP PostgreSQL nyata lulus: tenant memperoleh 200 untuk rooms/meters, latest/readings/daily, facilities dan usage sessions sesuai scope; tenant mendapat 403 untuk root/turunan owner; owner mendapat 200 untuk daftar Administrasi; tanpa sesi 401; logout 204 lalu akses kembali 401. Form/frontend owner dicakup 19 test frontend dan build Vite yang lulus. Browser lokal menampilkan build terbaru dan halaman login; login fungsional diverifikasi lewat HTTP dengan secret mount read-only.
- Suite Docker PostgreSQL nyata **24/24 lulus tanpa skip**. Test frontend relevan **19/19 lulus**. `npm run check`, build Vite/Docker, `git diff --check`, smoke MQTT/DB, serta verifikasi baca-saja dataset simulator 1441 sampel lulus. Ketiga layanan healthy.
- Fingerprint sebelum/sesudah identik: sesi 4/`45732f4a2093e38b28ffe5e0706cde6e`, event 8/`71b085ebafe2e3aad388f23b4d3f7fb3`, readings 1457/`1e58cd31a8eff1d6c0d8a434cbcbb54a`, non-RFID 1450/`3e93b4b5220142a05ef009871618f8cf`. Smoke hanya menambah probe development existing; tidak membuat reading, tap atau sesi. Tidak commit, push, deploy, reset database, atau menghapus volume.

## Audit dan rancangan billing — 24 September 2026

- Audit baca-saja mencakup PRD, ERD/panduan integritas, counter meter, occupancy, sesi RFID, data master, auth dan API. Belum ada tabel/migration/service/API/UI billing; ERD billing lama adalah rancangan, bukan schema aktif.
- Pengguna menyetujui arah desain dengan koreksi: ketidaklengkapan main meter hanya menahan `property_reconciliation`, bukan room bill yang meter kamar, tarif, occupancy dan boundary-nya valid. Konsekuensi MVP yang dicatat untuk konfirmasi tim: residual/shared tidak masuk payable room bill; room bill hanya direct-room dan sesi attributable valid.
- Kebijakan sementara: fasilitas multi-peserta review; energi fasilitas di luar sesi review; kamar kosong owner/unassigned; tarif energi Rp/kWh saja; tanpa invoice eksternal; sesi lintas occupancy/periode review; largest remainder dan tie-break ID; gap production menunggu firmware/interval nyata. Simulation hanya preview dan tidak finalizable sebagai tagihan nyata.
- Rencana migration dipecah menjadi empat gate review terpisah: provenance+tarif; periode+snapshot+issues; room bill+shares+session allocations; lalu lifecycle/audit/immutable guards. Migration 001–012 tidak diubah dan tidak ada SQL baru pada tahap ini.
- Fixture sintetis `test/fixtures/billing-calculation-v1.json` disiapkan untuk pure calculation tanpa DB. Fixture mencakup main meter incomplete tetapi room final, owner/unassigned, meter replacement, data invalid, sesi RFID valid/review, simulation preview, dan pembulatan deterministik. Fixture bukan seed/data pengamatan dan belum dijalankan sebagai kalkulator karena implementasi billing belum diizinkan.
- Detail keputusan dan pertanyaan tim ada di `BILLING-DESIGN.md`. Tidak mengubah database/API/frontend, tidak menjalankan migration/seed/simulator, dan tidak commit/push/deploy/reset/menghapus volume.

## Implementasi backend billing v1 — 24 September 2026

- Rancangan billing disetujui. Migration baru 013–019 diterapkan tanpa mengedit 001–012: provenance `simulation|production`, tarif temporal, periode/revisi, segmen meter, room bill, share occupancy/owner-unassigned, alokasi sesi, issue, dan guard final/immutable. Migration tidak membuat tarif, periode, tagihan, akun, reading, event, tap, atau sesi.
- Kalkulator backend memakai counter kumulatif dengan exact boundary, kualitas, epoch, reset/decrease, timestamp ambigu, dan policy gap. Nilai yang tidak dapat dibuktikan menjadi `null/review`, bukan nol. Pergantian meter hanya dijumlah bila seluruh segmen valid. Pembulatan Rupiah half-up dan largest remainder memakai tie-break ID deterministik.
- Room bill yang lengkap dapat finalized walau main meter membuat rekonsiliasi properti review. Energi fasilitas di luar sesi menjadi issue `facility_energy_outside_session` dan tidak dibagikan. Kamar tanpa occupancy memakai share `owner_unassigned`. Sesi lintas periode/occupancy atau energi tidak tersedia menjadi review.
- Data provenance simulation hanya menghasilkan preview; API dan trigger database menolak finalisasi. Ambang gap production tetap tidak ditetapkan, sehingga kalkulasi production nyata tetap review sampai policy hardware disetujui. Schema RFID existing membatasi satu participant; tidak ada alokasi multi-peserta otomatis.
- API owner menyediakan tarif temporal dan lifecycle periode create/recalculate/finalize/correction. Mutasi memakai CSRF, idempotency PostgreSQL, ownership, transaksi, audit dan row version. API tenant hanya memperlihatkan revisi finalized/share occupancy miliknya. Belum ada UI billing.
- Docker/PostgreSQL nyata: **28/28 test lulus** tanpa skip; test billing khusus 4/4. Backend direcreate dan healthy, smoke MQTT/DB lulus, serta dataset simulasi 12 September tetap 1.441 reading. Fixture PostgreSQL rollback dan tidak meninggalkan tagihan/tarif.
- Verifier fingerprint yang mengabaikan hanya kolom provenance baru membuktikan isi historis lama identik: sesi 4/`45732f4a2093e38b28ffe5e0706cde6e`, event 8/`71b085ebafe2e3aad388f23b4d3f7fb3`, readings 1.457/`1e58cd31a8eff1d6c0d8a434cbcbb54a`, non-RFID 1.450/`3e93b4b5220142a05ef009871618f8cf`.
- Detail endpoint, model, reason, batas policy dan hasil uji ada di `BILLING-DESIGN.md`; perintah lokal ada di `LOCAL-DEVELOPMENT.md`. Tidak commit, push, deploy, reset database, menghapus volume, mengubah UI, MQTT, broker/LAN, simulator, Railway, atau histori.

## Frontend billing owner dan tenant — 24 September 2026

- Navigasi baru **Billing** untuk owner dan **Tagihan saya** untuk tenant ditambahkan tanpa mengubah monitoring, RFID, atau Administrasi. Implementasi berada di `web/billing.jsx` dengan helper/test terpisah.
- Owner dapat melihat jadwal tarif dan revisi periode, membuat tarif/periode, retire tarif, recalculate, finalize, serta membuat correction. Detail memperlihatkan room bill, energi kamar/fasilitas, total rupiah, issue/reason, main meter dan selisih total kamar. Semua mutasi memakai CSRF dan idempotency helper existing; retry mempertahankan key/body yang sama.
- Tenant hanya membaca revisi finalized/share occupancy miliknya. Tarif berasal dari snapshot backend. Karena kontrak belum memiliki status pembayaran, UI menampilkan `Belum tersedia` dan tidak membuat asumsi.
- Simulation selalu berlabel **Pratinjau simulasi** dan finalisasi dinonaktifkan. Energi/nominal null selalu tampil **Perlu ditinjau**, bukan nol. UI tidak melakukan kalkulasi billing sendiri dan tidak memakai mock data.
- Test frontend relevan **18/18 lulus**; `npm run build`, `npm run check`, dan `git diff --check` lulus. Build warning chunk sekitar 644 kB tetap ada. Build final disalin ke container berjalan tanpa restart layanan.
- Verifier HTTP baca-saja dengan akun secret existing lulus: dua properti owner, endpoint tarif/periode 200, daftar tenant 200 dengan nol tagihan final sesuai database, dan tenant `/api/owner/billing-periods` 403. Browser lokal memuat build/login terbaru; halaman billing terautentikasi tidak dipaksa memakai data permanen karena database belum memiliki tarif/periode dan tugas melarang perubahan data simulasi.
- Batas kontrak: pemilih properti diturunkan dari kamar owner, sehingga properti tanpa kamar belum dapat dipilih. Tidak ada migration/API/backend calculation/data simulation yang diubah. Tidak commit atau push. Detail penggunaan ada di `FRONTEND-BILLING.md`.

## Kesiapan integrasi ESP32 dan MQTT produksi — 24 September 2026

- Kontrak simulator v1 diaudit dan dipertahankan. Backend kini juga subscribe topic produksi `smartbilling/v1/devices/+/readings`; schema payload v1, QoS 1, retain false, batas ukuran, deduplikasi, dan mapping temporal tetap sama. Namespace simulator `smartbilling/sim/v1/...` tidak berubah.
- Dokumen final `ESP32-MQTT-CONTRACT.md` menetapkan field, NTP/RFC3339, boot UUID, sequence, counter epoch, counter kumulatif, baseline sampling 60 detik, offline buffer/replay, TLS/ACL, reason penolakan, dan alasan energi interval tidak memadai. Contoh `docs/examples/esp32-config.example.h` hanya berisi placeholder.
- Reason ingest diperjelas menjadi `unregistered_device_uid`, `inactive_device`, `unregistered_channel`, `no_installation_at_timestamp`, `invalid_boot_id`, dan `invalid_timestamp`. Replay identik mengembalikan `duplicate_sequence`; konflik isi tetap `identity_conflict`. Rejection hanya menyimpan hash/ukuran/reason, sedangkan log tidak mencetak UID atau payload.
- Endpoint owner read-only `GET /api/owner/hardware-readiness?device_uid=...&at=...` dan CLI `verify-device-readiness.js` memeriksa device, meter asset, installation aktif, channel, dan target. Tenant tetap 403; device di luar scope owner 404. Tidak ada provisioning otomatis atau mutasi dari pemeriksaan.
- Suite Docker PostgreSQL nyata **33/33 lulus tanpa skip**. Backend direcreate dan healthy; subscription broker, smoke MQTT/DB, dataset simulator 1.441 reading, dan fingerprint histori seluruhnya lulus. Verifier live untuk `sim-running-01` pada 24 September mengembalikan `ready=true`, channel 1, tanpa issue.
- Fingerprint histori tetap identik: sesi 4/`45732f4a2093e38b28ffe5e0706cde6e`, event 8/`71b085ebafe2e3aad388f23b4d3f7fb3`, readings 1.457/`1e58cd31a8eff1d6c0d8a434cbcbb54a`, non-RFID 1.450/`3e93b4b5220142a05ef009871618f8cf`. Tidak mengubah billing, frontend, migration, broker/LAN, data simulasi, commit, push, reset, atau volume.
- Belum diuji pada ESP32/sensor nyata, Wi-Fi lokasi pemasangan, broker TLS/ACL production, NTP perangkat, flash offline queue, kalibrasi, QoS 1 library firmware, atau ambang gap billing production. `ready=true` hanya membuktikan mapping database.

## Penyempurnaan frontend billing — 25 September 2026

- Frontend billing existing diperluas tanpa mengubah migration, backend API, atau kalkulator billing. Navigasi owner **Billing** dan tenant **Tagihan saya** tetap terisolasi dari monitoring, RFID, autentikasi, serta Administrasi.
- Daftar periode owner kini memuat detail API secara baca-saja untuk menghitung jumlah kamar serta status preview/final/review. Setelah kalkulasi, tabel kamar menampilkan tenant temporal dari API occupancy/tenant, energi, snapshot tarif, nominal dan status. Meter utama dan akumulasi kamar tetap dibandingkan bila tersedia.
- Baris kamar membuka drawer responsif berisi periode, energi kamar/RFID, tarif, rumus, komponen biaya, nominal dan reason review. Endpoint billing v1 belum mengekspos boundary reading atau daftar alokasi sesi individual; UI menyatakan keterbatasan itu secara eksplisit dan tidak mengarang data.
- Finalisasi sekarang selalu melalui dialog konfirmasi yang menjelaskan snapshot immutable dan bahwa perubahan berikutnya harus berupa koreksi/revisi. CSRF, idempotency key, retry request yang sama, stale version, loading/empty/error, serta larangan finalisasi simulation tetap mengikuti helper existing.
- Tenant memfilter defensif hanya status finalized dan menampilkan tabel serta drawer rincian share miliknya. Status pembayaran tetap `Belum tersedia` karena tidak ada pada kontrak backend.
- Test frontend relevan **19/19 lulus**; build Vite, `npm run check`, dan `git diff --check` lulus. Verifier HTTP baca-saja mengakses rooms, occupancies, tenants, tariffs, periods owner dan periods tenant tanpa membuat data. Database lokal tetap tidak memiliki tarif/periode final, sehingga state detail nyata tidak dipaksakan dengan fixture permanen.
- Build final disalin ke container lokal untuk review. Warning bundle sekitar 652 kB tetap ada. Tidak commit atau push.

## Integrasi tagihan ke dashboard tenant — 25 September 2026

- Menu tenant sekarang bernama persis **Tagihan Saya** dan terhubung ke halaman daftar, bukan komponen tanpa navigasi. Dashboard monitoring tenant memiliki kartu **Tagihan Terbaru** dengan periode, kamar, nominal, status final, dan tombol menuju daftar bila data tersedia.
- Daftar tenant memuat seluruh revisi final yang diberikan API scoped, dengan periode, kamar, konsumsi, tarif, nominal, status, dan detail. Drawer detail memakai rumus yang mudah dibaca, menampilkan energi kamar serta alokasi RFID jika tersedia. Boundary meter awal/akhir belum ada dalam API v1 dan ditandai tidak tersedia; frontend tidak mengarang nilai.
- Empty state nyata diuji pada akun `tenant@simulation.invalid`: database lokal memiliki 0 periode final, sehingga dashboard dan halaman daftar menjelaskan bahwa tagihan akan muncul setelah owner menghitung dan memfinalisasi periode. Tidak ada nominal nol atau mock bill.
- Browser lokal terautentikasi membuktikan menu terlihat, kartu termuat, tombol **Buka Tagihan Saya** berpindah ke halaman daftar, dan halaman menampilkan 0 tagihan final. Verifier HTTP akun nyata membuktikan endpoint tenant 200 dan `/api/owner/billing-periods` tetap 403.
- `npm test`: 49 lulus, 0 gagal, 6 integrasi dilewati tanpa `INTEGRATION_DB=1`. Build Vite, `npm run check`, dan `git diff --check` lulus. Aset final disalin ke container lokal; backend/PostgreSQL/MQTT healthy. Warning bundle sekitar 654 kB tetap ada.
- Tidak mengubah migration, API backend, kalkulasi billing, data simulasi, MQTT, atau histori; tidak commit atau push.

## Status pembayaran manual tagihan — 25 September 2026

- Migration baru `020_bill_payments.sql` menambahkan state pembayaran per `bill_share` dan event lifecycle append-only. Nominal, energi, snapshot tarif, room bill dan share final tidak diubah. Default tanpa state adalah `unpaid`; `paid` menyimpan waktu server, catatan opsional dan owner pelaksana.
- Owner API menyediakan daftar share final dengan filter periode/kamar/tenant/status, `mark-paid`, serta `unmark-paid` dengan alasan wajib. Mutasi memerlukan tagihan finalized aktif, ownership, CSRF, UUID idempotency key, transaksi PostgreSQL dan payment row version. Setiap aksi menghasilkan payment event serta audit log; retry identik tidak menggandakan event/audit.
- UI owner menampilkan daftar pembayaran dan empat filter, dialog tandai lunas, serta pembatalan lunas. UI tenant menampilkan status pada kartu terbaru, daftar dan drawer; waktu/catatan muncul bila lunas. Tidak ada payment gateway, bukti transfer atau pembayaran otomatis.
- Test PostgreSQL nyata mencakup default unpaid, mark paid, replay idempotent, stale version, filter paid, unmark, audit/event tunggal, scope tenant/owner asing, tampilan kembali ke tenant, dan penolakan mutasi setelah revisi superseded. Seluruh suite container **33/33 lulus tanpa skip**.
- Suite host **50 lulus, 6 integrasi dilewati**, build Vite, check dan diff check lulus. Verifier akun nyata memperoleh 200 untuk daftar pembayaran owner, 200 untuk billing tenant kosong, serta 403 saat tenant mencoba namespace owner. Smoke MQTT/DB lulus dan semua layanan healthy.
- Fingerprint histori sebelum migration dan setelah test tetap identik: sesi 4/`45732f4a2093e38b28ffe5e0706cde6e`, event device 8/`71b085ebafe2e3aad388f23b4d3f7fb3`, readings 1.457/`1e58cd31a8eff1d6c0d8a434cbcbb54a`, non-RFID 1.450/`3e93b4b5220142a05ef009871618f8cf`. Fixture pembayaran berjalan dalam rollback; data lokal tetap tidak memiliki tagihan final permanen.

## Riwayat dan Laporan owner — 25 September 2026

- Menu owner **Laporan** ditambahkan tanpa terlihat bagi tenant. Halaman menyediakan filter periode final, rentang tanggal inklusif di UI, kamar, serta status pembayaran; loading/error/empty state ditangani tanpa membuat mock data.
- Endpoint read-only `GET /api/owner/reports/billing` melakukan ownership scope di SQL dan hanya membaca periode `finalized` dengan share occupancy tenant. Filter dijalankan sebelum agregasi; rentang wajib lengkap, maksimal 366 hari, dan hasil dibatasi 5.000 baris. Tenant menerima 403 dan owner lain memperoleh hasil kosong untuk properti yang bukan miliknya.
- Respons memuat konsumsi, snapshot tarif, nominal immutable, status billing/pembayaran, waktu pembayaran, ringkasan total energi/tagihan/lunas/tunggakan, jumlah kamar/tenant, dan agregat per kamar. Tidak ada kalkulasi ulang billing atau perubahan meter, tagihan, pembayaran maupun histori.
- UI menampilkan lima kartu ringkasan, dua grafik Recharts per kamar, dan tabel per tenant. Ekspor CSV menggunakan hasil filter yang sama, metadata filter, BOM UTF-8, separator titik koma untuk Excel, angka Rupiah mentah, tanggal terbaca, dan perlindungan formula injection.
- Test helper laporan mencakup agregasi, query tanggal eksklusif, metadata/kolom CSV dan formula injection. Test PostgreSQL mencakup filter periode/kamar/status, agregat, rentang tanggal valid/invalid, scope tenant serta owner asing. Suite host **53 lulus, 6 integration dilewati**; suite PostgreSQL Docker **33/33 lulus** tanpa skip. Build/check/diff lulus; warning bundle sekitar 705 kB tetap ada.
- Fingerprint histori sebelum/sesudah identik dengan baseline 4 sesi, 8 event, 1.457 readings dan 1.450 reading non-RFID. Database lokal tetap memiliki 0 tagihan final permanen, sehingga browser lokal menampilkan empty state laporan. Tidak commit atau push.

## Monitoring kesehatan perangkat dan kualitas data — 25 September 2026

- Migration baru `021_device_health.sql` menambah quality event append-only dan review alert ber-catatan. Migration tidak mengubah/membuat reading, sesi RFID, bill, tarif, atau data simulasi. Review tidak menghapus sumber masalah dan menghasilkan audit log.
- Ingest sensor sekarang mencatat reason aman yang dapat diatribusikan ke device/property untuk payload invalid, timestamp/channel/installation salah, duplicate sequence dan identity conflict. Tidak menyimpan payload, secret, cookie, token, atau UID RFID mentah; rejection device yang belum terdaftar tetap hanya ada sebagai hash pada mekanisme rejection existing.
- Endpoint owner `GET /api/owner/device-health` menggabungkan mapping aktif, reading terakhir, hitungan valid/ditolak, gap, reset/counter turun, timestamp ambigu dan asset tanpa installation. Filter tersedia untuk rentang maksimum 31 hari, status device/alert, device dan kamar. `POST .../alerts/review` memakai ownership, CSRF, UUID idempotency, transaksi, row version dan audit.
- UI owner **Kesehatan Perangkat** menyediakan ringkasan online/offline/terlambat/alert aktif, kartu device/meter, filter, tabel alert, drawer detail/tindakan saran, dialog review, serta loading/error/empty state. Menu dan endpoint tidak tersedia bagi tenant.
- Status memakai `DEVICE_HEALTH_ONLINE_SECONDS=180` dan `DEVICE_HEALTH_OFFLINE_SECONDS=900` pada development. Gap tampilan memakai `MONITORING_MAX_GAP_SECONDS=120`; ini tidak menetapkan policy gap billing production.
- Suite host: **57 lulus, 0 gagal, 7 integrasi dilewati**. Suite Docker/PostgreSQL nyata: **35/35 lulus tanpa skip**, termasuk scope/filter/status/review/audit/idempotency baru. Build Vite/Docker, check, diff check, smoke MQTT/DB, dan dataset simulator 1.441 sampel lulus. Bundle Vite sekitar 716 kB tetap memberi warning ukuran.
- Verifier akun nyata: owner melihat 4 device (3 offline, 1 belum pernah mengirim, 0 alert aktif pada rentang default 24 jam); tenant menerima 403 untuk endpoint owner. Seluruh layanan healthy.
- Fingerprint sebelum/sesudah tetap identik: sesi 4/`45732f4a2093e38b28ffe5e0706cde6e`, event 8/`71b085ebafe2e3aad388f23b4d3f7fb3`, readings 1.457/`1e58cd31a8eff1d6c0d8a434cbcbb54a`, non-RFID 1.450/`3e93b4b5220142a05ef009871618f8cf`. Tidak commit atau push.

## Identitas akun simulasi lokal — 26 September 2026

- User existing diperbarui menjadi `owner@simulation.local` (ID `00000000-0000-4000-8000-000000000001`) dan `tenant@simulation.local` (ID `00000000-0000-4000-8000-000000000201`). Record tidak dihapus/dibuat ulang; role dan ID tetap. Password disimpan sebagai hash scrypt di PostgreSQL dan secret password lokal berada di `.local/secrets/` yang diabaikan Git.
- Login HTTP lokal lulus untuk kedua email baru dan password yang diminta; dua email lama memperoleh 401. Tidak ada password plaintext di source, migration, dokumentasi, atau output.
- `scripts/provision.js` sekarang mengenali ID serta email lama/baru, mengunci transaksi, memperbarui row yang ada dan mencegah user duplikat saat provisioning ulang. `scripts/update-simulation-credentials.js` khusus perubahan credential hanya meng-update user existing dan mewajibkan tepat satu kecocokan. `seed-demo.js` untuk database lokal baru menggunakan alamat `.local`.
- Owner tetap memiliki properti yang sama; tenant mempertahankan tiga occupancy. Fingerprint sesi RFID, device event, meter readings, dan data existing sama dengan pemeriksaan sebelum perubahan: 4/`45732f4a2093e38b28ffe5e0706cde6e`, 8/`71b085ebafe2e3aad388f23b4d3f7fb3`, 1.457/`1e58cd31a8eff1d6c0d8a434cbcbb54a`, 1.450/`3e93b4b5220142a05ef009871618f8cf`. Tidak ada perubahan billing, pembayaran, RFID, monitoring, atau laporan.
- `npm run check`, `node --check` pada script provisioning/verifier, login HTTP kedua akun, dan penolakan HTTP kedua email lama berhasil. Tidak commit atau push.

## Halaman aktivasi tenant — 26 September 2026

- Owner melihat tautan aktivasi satu kali setelah membuat undangan. Tautan mengarah ke `/#/aktivasi?token=...`; pengiriman email belum disediakan, jadi owner membagikan tautan secara manual.
- Tenant membuka halaman aktivasi pada aplikasi yang sama, memasukkan/meninjau token, mengisi password dua kali (minimal 8 karakter sejak 26 September), lalu mengirim aktivasi melalui endpoint existing `/api/auth/activate` dengan CSRF. Token diambil dari fragment URL dan address bar dibersihkan; sukses menawarkan kembali ke login. Error token invalid/expired/used dijelaskan agar tenant meminta undangan baru.
- Tidak ada perubahan backend, database, sesi/RFID, histori, atau billing. Halaman memakai kontrak auth existing. `npm run build`, `npm run check`, dan `git diff --check` lulus. Docker backend berhasil dibangun ulang dan sehat; `GET /` serta `/health/ready` memberi 200 (database, MQTT, dan ingest siap). Bundle frontend terlayani dari Docker. Belum dilakukan aktivasi end-to-end memakai token undangan nyata agar tidak mengonsumsi undangan/data tenant; belum ada test suite yang dijalankan. Tidak commit atau push.

## Audit dan penyempurnaan UI/UX frontend — 26 September 2026

- Audit mencakup login, workspace/dashboard owner dan tenant, monitoring, riwayat RFID, administrasi, billing, pembayaran manual, laporan, serta kesehatan perangkat. API dan backend existing tetap menjadi sumber data; tidak membuat data mock baru atau mengubah aturan billing/RFID.
- Temuan utama: navigasi owner dengan enam pilihan mudah membungkus dan kehilangan hirarki di viewport sempit; navigasi aktif kurang terlihat; gaya status, tombol, panel, dialog, dan form berkembang berbeda antar modul; serta login dan toolbar mobile belum memiliki affordance visual/ukuran sentuh yang seragam.
- Navigasi kini menampilkan pilihan sesuai peran, memberi penanda halaman aktif yang aksesibel, dan dapat digeser horizontal di layar kecil tanpa mengubah aksi/perutean. Tenant hanya mendapat Monitoring, Sesi fasilitas RFID, dan Tagihan Saya; menu laporan, perangkat, dan administrasi tetap khusus owner.
- Lapisan gaya bersama menyelaraskan warna status, tipografi, fokus keyboard, tombol, card/panel, tabel, empty/error state, login, serta bayangan/backdrop dialog dan drawer. Penyesuaian responsif memperbaiki tinggi target sentuh, header akun, navigasi, ringkasan laporan dan jarak panel. Seluruh halaman yang disebut tetap memakai komponen, state, dan request API existing.
- Pemeriksaan frontend `node --test web/*.test.js`: **29/29 lulus**. `npm run build`: lulus; ada warning existing ukuran chunk JavaScript 715,75 kB (ambang 500 kB). `git diff --check`: lulus dengan pemberitahuan normal konversi LF/CRLF pada working tree.
- Keterbatasan audit visual: halaman memakai data yang tersedia saat runtime; dataset lokal tidak menyediakan tagihan final permanen, sehingga tabel/detail pembayaran dan laporan tidak dapat dinilai dengan contoh tagihan hidup tanpa menambah/mengubah data. Perbaikan ini berfokus pada konsistensi dan responsivitas CSS/navigasi, bukan pemecahan bundle atau perubahan kontrak API.
- Tidak mengubah endpoint/backend/migration, kalkulasi billing, perilaku RFID, dataset, atau commit/push. Working tree telah berisi perubahan existing sebelum pekerjaan ini; perubahan tersebut dipertahankan.

## Koreksi headbar dan identitas halaman login — 26 September 2026

- Screenshot pengguna menunjukkan bar akun dan navigasi workspace melebar mulai dari kiri viewport, sehingga bagian kirinya berada di belakang sidebar fixed. Keduanya kini mengikuti offset sidebar desktop (254 px; 220 px pada breakpoint tablet) dan kembali memenuhi viewport pada mobile.
- Login dan state pemeriksaan sesi menampilkan kembali ikon petir serta wordmark SmartBilling dengan palet hijau yang sama dengan halaman utama; tombol masuk memakai warna primer hijau.
- Verifikasi setelah koreksi: `npm run build` lulus, `node --test web/*.test.js` **29/29 lulus**, dan `git diff --check` lulus. Peringatan ukuran chunk Vite masih ada (~716 kB); tidak terkait dengan perubahan visual ini.
- Follow-up setelah laporan pengguna bahwa tampilan belum berubah: browser `127.0.0.1:3000` masih memuat bundle lama dari container backend (logo login belum ada di DOM). Docker Desktop tidak dapat dijalankan dari sandbox biasa; setelah pemeriksaan Docker dengan izin sesuai, aset hasil build terbaru disalin ke `/app/dist` pada container backend lokal yang aktif. Browser kemudian memuat logo SmartBilling dan aksen hijau. HTML/asset yang disajikan terverifikasi memuat offset 254 px, reset mobile, dan wordmark login.
- Owner dan tenant memakai `AuthGate`/`Workspace` dan stylesheet layout yang sama; keduanya menerima koreksi headbar. Login lokal tidak dikirim ulang untuk mengambil tangkapan layar dashboard karena browser telah berisi kredensial tersimpan; layout authenticated diverifikasi dari struktur komponen dan aturan CSS bersama. Aset yang disalin berlaku pada container lokal aktif; build Docker berikutnya dari repository akan mengambil source frontend terbaru.
- Bug saat pindah halaman (26 September): screenshot memperlihatkan gutter kosong di kiri halaman RFID karena komponen itu tidak merender sidebar monitoring, sementara offset bar masih dipakai. `AuthGate` kini memberi wrapper `.authenticated-app`; CSS hanya menambah gutter ketika wrapper berisi `.shell` monitoring, dan mengembalikannya ke nol pada halaman lain. Build dan aset aktif diperbarui lagi. `npm run build`, 29 test frontend, dan `git diff --check` lulus; bundle warning sekitar 716 kB tetap ada. CSS yang disajikan memuat aturan monitoring desktop 254 px, tablet 220 px, serta reset mobile.
- Tindak lanjut preferensi UI (26 September): sidebar kini menjadi bagian tetap layout workspace untuk semua halaman owner/tenant. Menu sidebar kembali membuka Monitoring; daftar titik pengukuran hanya dirender ketika Monitoring aktif dan sengaja kosong saat halaman lain dipilih. Fetch katalog diangkat ke `Workspace` supaya App monitoring dan sidebar berbagi data yang sama tanpa request katalog ganda. Content area dan navigasi kini berada di sebelah sidebar tetap. Build terbaru disalin ke container lokal aktif; `npm run build`, `npm run check`, serta test frontend **29/29** lulus. Tidak mengubah API/backend atau data.
- Penyesuaian sidebar (26 September): daftar titik pengukuran kini memakai area scroll vertikal terpisah (`min-height: 0`, overflow-y auto) agar semua kartu tetap berukuran utuh tanpa memaksa tombol Monitoring/footer mengecil atau keluar dari viewport. Perilaku hanya aktif pada desktop/tablet ketika daftar monitoring ditampilkan; mobile tetap memakai navigasi ringkas. Build/check/29 test frontend lulus dan asset baru disajikan container lokal.
- Favicon SmartBilling (26 September): `web/index.html` kini menunjuk ke `web/public/favicon.svg`, memakai tanda petir hijau pada latar lime senada wordmark. Build berhasil dan `GET /favicon.svg` pada aplikasi lokal mengembalikan HTTP 200 dengan tipe `image/svg+xml`; aset sudah disalin ke container aktif. Browser dapat menahan cache favicon, jadi refresh tab atau buka ulang halaman bila globe lama belum berganti.
- Penyelarasan favicon (26 September): bentuk petir generik diganti dengan glyph `ϟ` dan warna yang sama seperti `.brand-icon` pada page/login. Build berhasil; endpoint favicon aktif merespons 200 dan SVG terverifikasi memuat glyph tersebut.

## Data master contoh kamar owner — 26 September 2026

- Atas permintaan pengguna, dibuat satu record manual pada properti demo owner: **KMR-01 — Kamar 1** (`active_from` 1 Januari 2026). Tidak mengganti atau menghapus kamar simulasi maupun record uji existing.
- Dibuat tenant fiktif **Nadia Putri (contoh)** menggunakan alamat `.invalid`, diaktifkan lokal, lalu dicatat masa tinggal 3 September–20 Desember 2026 WIB. Password acak hanya disimpan di `.local/secrets/tenant_kamar1_password` yang diabaikan Git; tidak ditampilkan pada output/dokumentasi. Tidak ada email yang dikirim.
- Verifikasi API owner: kamar `source=manual`, tenant aktif, occupancy sesuai rentang. API monitoring menampilkan Kamar 1. Tidak ada meter yang dipetakan dan tidak dibuat pembacaan sensor, sesi RFID, tarif, atau tagihan; data pengukuran dapat diisi setelah tersedia. Helper sementara dan key retry lokal sudah dibersihkan.

## Rename nama properti owner — 26 September 2026

- Ditambahkan daftar owner `GET /api/owner/properties` dan mutasi `PATCH /api/owner/properties/:id`. Mutasi mempertahankan ID dan seluruh relasi, mewajibkan nama, alasan, versi, CSRF, dan Idempotency-Key; update nama serta audit terjadi dalam transaksi yang sama. Migrasi baru 022 menambahkan `row_version` dan `updated_at`, tanpa mengedit migration lama.
- Administrasi memiliki kategori Properti dan aksi **Ubah nama properti**. Billing memilih nama properti dari API, dan selector properti pada form master juga menggunakan nama alih-alih hanya ID.
- UUID properti sengaja disembunyikan dari list/detail owner; daftar menampilkan nama dan zona waktu. UUID tetap stabil sebagai key internal agar seluruh FK dan histori tidak berubah.
- Label properti pada baris data master terkait (misalnya kamar) juga memakai nama properti dari daftar API, bukan potongan UUID.
- Verifikasi nyata: migration 022 berjalan pada PostgreSQL Docker yang ada; integration test master-data **3/3 lulus** dalam container, termasuk daftar owner-scoped, rename, retry idempotent, versi stale, audit, ID tetap, akses lintas owner/tenant, dan tes paralel existing. Test frontend **29/29 lulus**; keseluruhan `npm test` **57 lulus, 7 skip** (suite PostgreSQL lainnya memerlukan aktivasi integrasi khusus). `npm run check`, `npm run build` (warning chunk Vite existing sekitar 721 kB), dan `git diff --check` lulus; diff check hanya memberi peringatan konversi LF/CRLF. Backend Docker direcreate sehat; `/health/ready` dan `/` mengembalikan HTTP 200. Tidak ada tagihan, reading, sesi RFID, atau relasi yang diubah oleh verifikasi; perubahan DB hanya schema migration. Tidak commit atau push.

## Minimum password aktivasi diturunkan — 26 September 2026

- Atas permintaan pengguna, minimum password pada aktivasi akun dan provisioning lokal diturunkan dari 12 menjadi 8 karakter. Tidak wajib tepat 8; password lebih panjang tetap diterima dan disarankan. Validasi diberlakukan di UI dan backend melalui `hashPassword`, sehingga seluruh password baru konsisten.
- Tidak mengubah atau mereset password/hash akun yang ada. Unit auth menerima password 8 karakter dan menolak 7. Verifikasi HTTP lokal untuk endpoint aktivasi menghasilkan `invalid_activation_input` pada 7 karakter dan `invalid_or_expired_invitation` pada 8 karakter dengan token dummy, sehingga tidak membuat/mengaktifkan akun. `npm run check`, keseluruhan test suite (DB-gated skips tetap), frontend test, dan build lulus; health Docker 200. Tidak ada perubahan migration atau data akun.
