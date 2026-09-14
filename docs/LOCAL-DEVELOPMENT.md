# Lingkungan pengembangan lokal

Project aktif: **SmartBilling / Capstone A05**, `C:\Users\Admin\source\repos\SmartBilling`.

## Prasyarat dan Docker Windows

Node.js 22 atau lebih baru diperlukan untuk utilitas inisialisasi lokal. Node pada mesin yang diperiksa adalah 22.20.0, npm 10.9.3. Runtime container mengikuti Node 22; image lain adalah PostgreSQL 17 dan Eclipse Mosquitto 2. Major version ditetapkan, patch image dapat bergerak saat pull; dependency npm dikunci dalam `package-lock.json`.

Docker Desktop ditemukan pada instalasi per-user:

```text
%LOCALAPPDATA%\Programs\DockerDesktop\Docker Desktop.exe
%LOCALAPPDATA%\Programs\DockerDesktop\resources\bin\docker.exe
```

CLI Docker tidak ditemukan di PATH sesi pemeriksaan. Wrapper `scripts/docker.ps1` mencari CLI di PATH lalu lokasi per-user tanpa mengubah konfigurasi Windows. WSL 2.6.1.0 tersedia; Ubuntu-22.04 dan docker-desktop terdaftar sebagai WSL 2. Pesan WSL1 tidak didukung bukan alasan untuk mengaktifkan WSL1 bagi lingkungan ini.

```powershell
Set-Location C:\Users\Admin\source\repos\SmartBilling
.\scripts\docker.ps1 version
.\scripts\docker.ps1 compose version
```

`version` harus menampilkan Client dan Server sebelum build/run. Jika Desktop belum aktif, buka Docker Desktop melalui Start menu. Status pemeriksaan nyata dan kendala startup terbaru dicatat di HANDOFF; jangan menganggap keberadaan CLI berarti Engine sudah berjalan. Tidak perlu menginstal ulang, mengaktifkan fitur Windows, atau me-reset data tanpa diagnosis lanjutan.

## Konfigurasi awal

```powershell
npm run init:local
.\scripts\docker.ps1 compose config --quiet
.\scripts\docker.ps1 compose build
.\scripts\docker.ps1 compose up -d --wait postgres mqtt
.\scripts\docker.ps1 compose run --rm --no-deps backend npm run migrate
.\scripts\docker.ps1 compose up -d --wait --wait-timeout 120
.\scripts\docker.ps1 compose exec -T backend npm run seed:demo
.\scripts\docker.ps1 compose ps
```

`init:local` hanya memerlukan Node bawaan, bukan dependency npm. Script membuat `.env` dan dua password acak di `.local/secrets/` jika belum ada; berkas existing tidak ditimpa. `.env.example` hanya memuat contoh/placeholder. Jangan commit atau membagikan `.env`, `.local/`, atau isi secret. Compose memasang password sebagai berkas secret. Password PostgreSQL pada volume yang sudah terinisialisasi tidak berubah hanya dengan mengganti berkas secret; pertahankan berkas tersebut dan jangan melakukan rotasi tanpa prosedur tersendiri.

Nama Compose `smartbilling-a05-dev` memisahkan resource proyek ini dari proyek lain. Volume PostgreSQL dan broker bertahan setelah container berhenti/dibuat ulang. Tidak ada port PostgreSQL/MQTT yang dipublikasikan ke host atau LAN. Backend dipublikasikan pada `127.0.0.1:3000`; ubah `BACKEND_PORT` di `.env` jika port tersebut sudah dipakai. Jangan mengubahnya menjadi bind semua interface tanpa meninjau kebutuhan akses.

## Pemeriksaan dan pesan uji

```powershell
Invoke-RestMethod http://127.0.0.1:3000/health/live
Invoke-RestMethod http://127.0.0.1:3000/health/ready
.\scripts\docker.ps1 compose exec -T backend npm run smoke
```

`/health/live` menandakan proses berjalan. `/health/ready` mengembalikan 200 hanya jika query PostgreSQL berhasil dan backend telah subscribe MQTT; jika dependency gagal, statusnya 503. Pool PostgreSQL membuat koneksi lagi pada query/probe selanjutnya, dengan timeout tiga detik. MQTT mencoba reconnect tiap dua detik dan subscribe ulang setelah terhubung. Startup Compose menunggu health check dependency; runtime tetap memeriksa koneksi setelah startup.

Smoke test melakukan round trip: client uji publish → backend subscribe → backend publish balasan → client uji menerima balasan, lalu menulis dan membaca penanda uji PostgreSQL. Topic eksklusif `smartbilling/dev-check/*`, pesan `development-check`, dan database `smartbilling_dev` digunakan. Tabel `dev_checks.probes` hanya menyimpan UUID dan waktu uji; tidak ada pembacaan sensor/pengamatan asli. Backend dan script menolak APP_ENV/database di luar konfigurasi pengembangan tersebut.

Uji smoke ini membuktikan koneksi lingkungan. Bukti ingest dan persistensi sensor memakai pengujian simulasi terpisah di bagian terbaru di bawah; tidak membuktikan kompatibilitas ESP32. Pesan probe memakai sesi MQTT bersih.

## Uji restart dan pemulihan koneksi

Jalankan setelah smoke test berhasil. Perintah ini hanya memulai ulang layanan proyek ini.

```powershell
.\scripts\docker.ps1 compose restart postgres mqtt
.\scripts\docker.ps1 compose up -d --wait --wait-timeout 120
.\scripts\docker.ps1 compose exec -T backend npm run verify:persistence
.\scripts\docker.ps1 compose exec -T backend npm run smoke
```

`verify:persistence` hanya membaca penanda yang dibuat smoke test sebelumnya. Keberhasilannya setelah restart menunjukkan data uji bertahan. Smoke test berikutnya memeriksa koneksi pulih dan round trip baru berhasil.

## Pengembangan dan penghentian

```powershell
npm ci
npm run check
.\scripts\docker.ps1 compose up -d --build --wait
.\scripts\docker.ps1 compose logs --tail 50 backend mqtt
.\scripts\docker.ps1 compose stop
```

Backend dan dashboard berjalan dari image. Setelah mengubah kode, build ulang seperti di atas dan reload browser. Tidak ada hot reload pada mode Compose ini. `compose stop` mempertahankan container/volume. Jangan memakai `down -v`, volume prune, factory reset, atau menghapus distro WSL sebagai langkah startup rutin.

Migration inti monitoring kini tersedia. Pembuatan `dev_checks.probes` tetap hanya pemeriksaan infrastruktur. Pengamatan nyata nanti memerlukan database/dataset tersendiri, kontrak MQTT firmware, hak akses, dan migration yang tervalidasi. Konfigurasi ini belum merupakan konfigurasi deployment Railway atau broker untuk akses LAN/ESP32.

## Monitoring — tambahan 11 September 2026

Setelah Engine siap dan image dibangun ulang:

```powershell
.\scripts\docker.ps1 compose exec -T backend npm run smoke
.\scripts\docker.ps1 compose exec -T backend npm run migrate
.\scripts\docker.ps1 compose exec -T backend npm run seed:demo
.\scripts\docker.ps1 compose exec -T -e INTEGRATION_DB=1 backend npm test
```

Migration menggunakan transaksi, advisory lock, dan checksum. Migration yang telah diterapkan tidak boleh diedit; buat migration berikutnya. Tidak ada perintah down migration/destructive reset. Extension PostgreSQL `btree_gist` diperlukan untuk constraint interval pemasangan yang tidak boleh overlap. Script hanya mengizinkan database `smartbilling_dev`, dan tidak menyentuh tabel `dev_checks` existing.

Seed hanya memasukkan akun owner simulasi nonaktif, bangunan, kamar, perangkat, fasilitas, dan tiga meter (channel 0 utama, 1 kamar, 2 komunal). Tidak ada password login yang dapat digunakan, dan tidak ada pembacaan sensor yang dibuat oleh seed. ID tetap memakai prefix `00000000-0000-4000-8000-` agar dapat dirujuk saat development; seed tidak menimpa ID existing. Database ini khusus simulasi dan tidak boleh dipakai menyimpan pengamatan nyata.

Lihat `API-MONITORING.md` untuk endpoint. Readiness infrastruktur tidak membuktikan migration sudah diterapkan. `npm test` pada host menjalankan unit/API test dengan database tiruan; test PostgreSQL dilewati kecuali `INTEGRATION_DB=1`. Test PostgreSQL memakai transaksi yang di-rollback, sehingga tidak menghapus data existing. Konsumsi harian memakai aturan konservatif yang disetujui dengan `MONITORING_MAX_GAP_SECONDS=120` untuk simulasi. Ingest/simulator disetujui dan aktif sejak 13 September 2026.

Docker berhasil dipulihkan 11 September, tetapi error socket berulang saat startup 12 September. Kedua direktori runtime dicadangkan bersamaan lagi sebelum startup; lokasi cadangan ada di HANDOFF. Engine kemudian berhasil menjalankan build dan seluruh layanan. Pemulihan ini belum merupakan jaminan bug socket hilang pada startup Desktop berikutnya. Jangan melakukan reset atau penghapusan volume untuk mengatasinya.

## Hasil verifikasi 12 September 2026

Build, migration, seed, smoke test, dan test dengan `INTEGRATION_DB=1` berhasil: **7 lulus, 0 skipped**. Seluruh endpoint health/daftar/latest/histori/harian memberikan HTTP 200 dari host. Ada 1 kamar dan 3 meter demo; latest null, histori kosong, harian no_data. Integration test menggunakan dua pembacaan sementara dalam transaksi rollback, bukan data pengamatan.

Restart postgres, mqtt, dan backend berhasil. `verify:persistence` lulus dan sidik jari kumpulan ID probe identik sebelum/sesudah restart. Mapping demo juga bertahan. Smoke test baru setelah restart berhasil. Bukti persistensi ini untuk probe dan mapping; histori sensor permanen belum diuji karena masih kosong. Ketiga layanan dibiarkan healthy, backend pada localhost:3000. Kontrak MQTT sensor tetap menunggu persetujuan pengguna.

## Simulator dan pengujian sensor — 13 September 2026

Bagian ini menggantikan status histori kosong/kontrak tertunda pada catatan 12 September. Setelah startup/migration/seed di atas:

```powershell
Set-Location C:\Users\Admin\source\repos\SmartBilling
.\scripts\docker.ps1 compose exec -T backend node scripts/simulate.js 2026-09-12
.\scripts\docker.ps1 compose exec -T -e INTEGRATION_DB=1 backend npm test
.\scripts\docker.ps1 compose exec -T backend node scripts/verify-mqtt.js 2026-09-12
.\scripts\docker.ps1 compose restart postgres mqtt backend
.\scripts\docker.ps1 compose up -d --wait --wait-timeout 120
.\scripts\docker.ps1 compose exec -T backend node scripts/simulate.js 2026-09-12 --verify-only
```

Gunakan pemanggilan `node` langsung di PowerShell agar flag script tidak ditafsirkan npm sebagai opsi konfigurasi. Tanggal opsional (default kemarin Jakarta). Dataset menghasilkan 1441 sampel per hari; tanggal yang sama dapat diulang tanpa menambah pembacaan. Data tersimpan permanen sebagai simulasi di smartbilling_dev, bukan seed pengamatan. Script test:mqtt juga menambah catatan penolakan uji; tidak membersihkan histori existing.

`--verify-only` tidak tersambung MQTT dan tidak publish: membandingkan seluruh 1441 sampel DB dengan dataset yang diharapkan. Ini bukti persistensi sensor setelah restart; `verify:persistence` lama hanya membuktikan probe. Uji terbaru: 10 test lulus tanpa skip, end-to-end MQTT lulus, fingerprint seluruh 1441 row identik sebelum/sesudah restart. Detail hasil dan batas pengujian di HANDOFF.

Layanan tetap lokal; simulator mengakses broker melalui jaringan internal container. Tidak perlu tindakan manual tambahan untuk menjalankan simulator saat Engine aktif. Error socket Desktop sempat berulang dan dipulihkan lagi 13 September; ini tidak membuktikan bug startup Windows selesai permanen.

## Rujukan teknis lanjutan

- [Image resmi Node.js](https://github.com/nodejs/docker-node)
- [Image resmi PostgreSQL](https://hub.docker.com/_/postgres)
- [Autentikasi Eclipse Mosquitto](https://www.mosquitto.org/documentation/authentication-methods/)

## Dashboard lokal — 14 September 2026

React + Vite (JavaScript), Recharts dan CSS biasa disetujui pengguna. Dockerfile membangun web/ menjadi dist/ dalam tahap build, lalu Express menyajikannya bersama API. Tidak perlu server frontend tambahan, akses LAN, CDN atau secret frontend. Versi dependency dikunci pada package-lock.json. Output dist/ sudah diabaikan oleh aturan Git existing.

Jika konfigurasi/migration/demo sudah tersedia:

```powershell
Set-Location C:\Users\Admin\source\repos\SmartBilling
.\scripts\docker.ps1 compose up -d --build --wait --wait-timeout 120
Start-Process 'http://127.0.0.1:3000'
```

Untuk instalasi baru, ikuti Konfigurasi awal di atas (init:local, build, dependency, migrate, startup, seed). Dashboard tidak menjalankan seed atau simulator otomatis. Untuk menambahkan dataset simulasi secara eksplisit, gunakan perintah simulator tanggal 2026-09-12 pada bagian sebelumnya.

Cara mencoba:

1. Pilih Kamar simulasi. Kartu memperlihatkan latest yang tersimpan, energi kumulatif dan timestamp sebenarnya. Status Pembacaan lama tidak berubah hanya karena backend terhubung.
2. Klik Dataset 12 Sep untuk histori satu hari dan total harian 1,44 kWh dari dataset existing. Histori mentah berakhir eksklusif: 1440 sampel pada tanggal 12; daily memakai 1441 sampel termasuk batas tanggal 13.
3. Klik 7 hari terakhir untuk tujuh tanggal kalender sampai hari ini. Rentang bisa memuat hari tanpa data/parsial; bukan bukti tujuh hari pengamatan selesai.
4. Pilih meter utama atau komunal untuk kondisi belum ada pembacaan. Null ditulis Tidak tersedia.
5. Perbarui data memuat ulang daftar, latest, seluruh histori dan daily. Polling otomatis health/latest setiap lima detik berhenti saat tab tersembunyi; perubahan ID latest memicu reload histori. Data terlambat yang tidak mengubah latest perlu refresh manual. Permintaan lama dibatalkan saat meter/rentang berubah.

Zona awal memakai Asia/Jakarta sesuai mapping demo lokal; label dan query histori mengikuti timezone serta batas hari yang dikembalikan API daily setelah respons. Preset tujuh hari berikutnya menggunakan zona tersebut. Halaman memuat seluruh next_after/next_cursor; kegagalan halaman lanjutan tidak dianggap histori lengkap. Subtotal valid berasal dari backend, tanpa hitung konsumsi di browser.

Verifikasi kode dan database:

```powershell
npm ci
npm run check
npm run build
.\scripts\docker.ps1 compose exec -T -e INTEGRATION_DB=1 backend npm test
.\scripts\docker.ps1 compose exec -T backend npm run smoke
.\scripts\docker.ps1 compose exec -T backend node scripts/simulate.js 2026-09-12 --verify-only
```

Simulator berkala belum ditambahkan: dashboard dapat menunjukkan histori dan usia sensor secara jujur tanpa mengubah dataset deterministik. Jika dibutuhkan berikutnya, gunakan mapping dan identitas simulasi terpisah. API masih tanpa autentikasi dan hanya localhost; belum siap dipublikasikan.
