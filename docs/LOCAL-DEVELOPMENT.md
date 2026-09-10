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

Belum ada migration ERD untuk dijalankan. Pembuatan `dev_checks.probes` adalah pemeriksaan infrastruktur saja. Pengamatan nyata nanti memerlukan database/dataset tersendiri, mapping perangkat, kontrak MQTT firmware, hak akses, dan migration yang tervalidasi. Konfigurasi ini belum merupakan konfigurasi deployment Railway atau broker untuk akses LAN/ESP32.

## Rujukan teknis

- [Image resmi Node.js](https://github.com/nodejs/docker-node)
- [Image resmi PostgreSQL](https://hub.docker.com/_/postgres)
- [Autentikasi Eclipse Mosquitto](https://www.mosquitto.org/documentation/authentication-methods/)
