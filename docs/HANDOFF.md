# Handoff Capstone A05

Diperbarui: 10 September 2026. Konteks awal berasal dari diskusi 9 September; lihat catatan persiapan di bawah untuk status repository terkini.

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
