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
.\scripts\docker.ps1 compose up -d --build --wait --wait-timeout 120
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

Uji ini membuktikan koneksi lingkungan, bukan ingest MQTT persisten, kompatibilitas firmware/ESP32, perhitungan energi, atau implementasi ERD. Pesan probe memakai sesi MQTT bersih; tidak ada jaminan pengiriman ulang data sensor saat gangguan. Fitur ingest yang tahan gangguan akan dikerjakan terpisah.

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

Backend berjalan dari image. Setelah mengubah kode, build ulang seperti di atas. Tidak ada hot reload atau frontend pada tahap persiapan ini. `compose stop` mempertahankan container/volume. Jangan memakai `down -v`, volume prune, factory reset, atau menghapus distro WSL sebagai langkah startup rutin.

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

Lihat `API-MONITORING.md` untuk endpoint. Readiness infrastruktur tidak membuktikan migration sudah diterapkan. `npm test` pada host menjalankan unit/API test dengan database tiruan; test PostgreSQL dilewati kecuali `INTEGRATION_DB=1`. Test PostgreSQL memakai transaksi yang di-rollback, sehingga tidak menghapus data existing. Konsumsi harian memakai aturan konservatif yang disetujui dengan `MONITORING_MAX_GAP_SECONDS=120` untuk simulasi. Ingest/simulator masih menunggu keputusan kontrak MQTT pengguna.

Docker diperiksa ulang 11 September: startup masih gagal saat rename socket `sailor-ingest.sock` ke `.stale`. Tindakan manual: tutup dialog error dengan **Quit**, bukan factory reset. Engine perlu dipulihkan sebelum perintah container di atas bisa dijalankan. Pengubahan socket di luar repository belum diizinkan; tidak dilakukan penghapusan socket/volume/distro maupun perubahan fitur Windows. Instalasi ulang dan restart Windows belum terbukti wajib.

## Rujukan teknis

- [Image resmi Node.js](https://github.com/nodejs/docker-node)
- [Image resmi PostgreSQL](https://hub.docker.com/_/postgres)
- [Autentikasi Eclipse Mosquitto](https://www.mosquitto.org/documentation/authentication-methods/)
