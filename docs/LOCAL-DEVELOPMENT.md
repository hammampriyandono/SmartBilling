# Lingkungan pengembangan lokal

Frontend Administrasi owner mendukung mutasi sesuai API sejak 23 September 2026: form, invitation, lifecycle, CSRF, versi dan retry idempoten. Cara memakai data existing tanpa migration/seed dan memperbarui aset saja: [FRONTEND-ADMIN.md](FRONTEND-ADMIN.md).

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

Simulator berkala tersedia dengan mapping dan identitas terpisah; lihat petunjuk berikut. API masih tanpa autentikasi dan hanya localhost; belum siap dipublikasikan.

## Simulator berkala (Simulasi berjalan)

Simulator ini berjalan hanya jika dipanggil eksplisit, melalui profil Compose `simulation`. Default: lima sampel, interval 60 detik (sampel pertama langsung, total sekitar empat menit), paling lama satu jam termasuk gangguan. Argumen opsional jumlah 1–60 dan interval 1–3600 detik, dengan rentang pengiriman maksimal satu jam. Polling dashboard tetap lima detik.

Jika layanan existing sehat dan migration 003 sudah terpasang, langsung jalankan simulator; tidak perlu build, seed atau pemulihan Docker ulang. Periksa dengan `.\scripts\docker.ps1 compose ps`. Siapkan image dan migration baru hanya sebelum penggunaan pertama atau ketika perubahan kode memerlukan build:

```powershell
Set-Location C:\Users\Admin\source\repos\SmartBilling
.\scripts\docker.ps1 compose build backend
.\scripts\docker.ps1 compose up -d --wait postgres mqtt
.\scripts\docker.ps1 compose run --rm --no-deps backend npm run migrate
.\scripts\docker.ps1 compose up -d --wait backend
# Untuk instalasi baru saja: pastikan seed:demo telah dijalankan.
```

Jalankan dengan nama container yang dapat dihentikan dari terminal lain:

```powershell
.\scripts\docker.ps1 compose --profile simulation run --rm -d --no-deps --name smartbilling-simulator simulator
.\scripts\docker.ps1 logs -f smartbilling-simulator
```

Buka http://127.0.0.1:3000, klik Perbarui data sekali jika mapping baru belum ada pada daftar, pilih **Simulasi berjalan**, lalu pilih **7 hari terakhir**. Setelah meter terpilih, nilai dan histori berikutnya diperbarui otomatis tanpa klik refresh. Daftar meter sendiri tidak dipolling; langkah awal tersebut hanya untuk menemukan mapping baru. Terminal log dapat ditutup dengan Ctrl+C tanpa menghentikan container detached.

Menghentikan simulator sebelum jumlah sampel habis:

```powershell
.\scripts\docker.ps1 stop --timeout 15 smartbilling-simulator
```

Setelah berhenti, container `--rm` terhapus otomatis; checkpoint dan semua pembacaan tetap berada di PostgreSQL. Jalankan perintah run yang sama untuk mulai kembali dengan counter berlanjut. Jangan memakai volume prune atau reset. Untuk contoh tiga sampel:

```powershell
.\scripts\docker.ps1 compose --profile simulation run --rm -d --no-deps --name smartbilling-simulator simulator 3 60
```

Mapping idempoten: kamar SIM-RUN / **Simulasi berjalan**, device `sim-running-01`, channel 1, meter `00000000-0000-4000-8000-000000000105`. Mapping konflik ditolak tanpa ditimpa. Dataset deterministik memakai perangkat/meter lain dan tidak diubah. Prasyarat bangunan demo tersedia dari seed:demo; ingest tidak mendaftarkan device otomatis.

Counter dimulai nol hanya saat belum ada histori/checkpoint meter baru. Setiap proses memakai UUID boot baru; sequence naik per proses. Counter epoch tetap 0 karena restart bukan reset energi. Checkpoint `dev_checks.running_simulator` (migration 003) menyimpan payload dan sisa presisi sebelum publish; pending direplay dengan identitas dan payload sama sampai isi DB terkonfirmasi. Jika checkpoint hilang sementara histori ada, simulator berhenti, bukan diam-diam reset. Session advisory lock mencegah dua simulator menulis sumber yang sama bersamaan.

Model beban virtual: daya 60, 120, 90, 180, 75, 150 W berulang, tegangan 220 V, faktor daya 0,95; arus disesuaikan. Daya tiap sampel berlaku sampai sampel selanjutnya, termasuk ketika proses berhenti. Integrasi W × waktu aktual memakai integer nano-kWh dan sisa pembagian persisten; tidak mengasumsikan interval selalu tepat 60 detik. Jeda offline tetap menjadi gap pada kualitas daily backend; subtotal parsial bukan estimasi total. Ini hanya model simulasi, bukan pengukuran atau kalibrasi hardware.

Pengiriman memiliki maksimum tiga percobaan konfirmasi, memakai byte/identitas sama. Gagal/stop meninggalkan pending untuk run berikutnya. SIGINT/SIGTERM ditangani; batas shutdown delapan detik mempertahankan checkpoint walaupun koneksi terputus. Konfirmasi memeriksa row DB, bukan hanya PUBACK broker. Perintah baca saja untuk memeriksa konsistensi counter dan dataset lama:

```powershell
.\scripts\docker.ps1 compose exec -T backend node scripts/verify-running.js
```

Penanda pembacaan lama menggunakan usia aktual >120 detik (atau konfigurasi toleransi API), diperiksa pada polling lima detik berikutnya. Tidak adanya pesan baru tidak mengubah status koneksi backend menjadi gagal. Tidak ada stream ESP32, RFID, billing, akses LAN atau deployment pada utilitas ini.

## Simulasi sesi RFID

Frontend terkini tersedia untuk owner dan tenant melalui navigasi **Riwayat fasilitas RFID**, memakai tanggal WIB dan pagination. Lihat [FRONTEND-RFID.md](FRONTEND-RFID.md) untuk cara memakai data existing tanpa simulator, build aset saja, akun uji dan batas verifikasi. Keterangan UI owner saja/UTC pada catatan awal di bawah telah digantikan modul frontend 19 September 2026.

Kontrak simulasi v1 disetujui 17 September 2026: [RFID-SIMULATION-PLAN](RFID-SIMULATION-PLAN.md). Ini sumber tap sintetis, bukan firmware ESP32. Login owner/tenant existing tetap digunakan. Jangan menjalankan seed awal atau mereset database untuk mencoba RFID.

Untuk mengambil perubahan kode ini pada lingkungan existing, build sekali dan terapkan migration tambahan sebelum backend baru:

```powershell
.\scripts\docker.ps1 compose build backend
.\scripts\docker.ps1 compose run --rm --no-deps backend npm run migrate
.\scripts\docker.ps1 compose up -d --no-deps --wait backend
.\scripts\docker.ps1 compose exec -T backend node scripts/provision-rfid.js
```

Jika layanan sudah memakai versi ini, langsung provisioning idempoten/run; tidak perlu build/migrate berulang. Provisioning hanya menambah mapping RFID terpisah, tidak mengaktifkan akun atau mengubah occupancy. Prasyarat tenant demo aktif dan occupancy di bangunan demo berlaku sekarang; bila belum siap, gunakan alur provisioning autentikasi existing secara eksplisit (`scripts/provision-local.ps1`), bukan mengubah data secara manual.

Mapping baru: device `sim-rfid-01`, reader channel 0, fasilitas `00000000-0000-4000-8000-000000000303`, meter `00000000-0000-4000-8000-000000000304`, label **Fasilitas RFID — Simulasi**. Kartu sintetis diikat ke tenant demo; UID tidak dicetak pada log/API.

```powershell
# Demo default: dua tap, tiga pembacaan, interval 60 detik; selesai sekitar 120 detik.
.\scripts\docker.ps1 compose run --rm -d --no-deps --name smartbilling-rfid-simulator backend node scripts/simulate-rfid.js demo
.\scripts\docker.ps1 logs -f smartbilling-rfid-simulator
# Opsional: stop sebelum demo selesai. Sesi yang terbuka tetap terbuka.
.\scripts\docker.ps1 stop --timeout 15 smartbilling-rfid-simulator
# Satu tap eksplisit: buka jika kosong, tutup jika kartu sama masih memiliki sesi sah.
.\scripts\docker.ps1 compose run --rm --no-deps backend node scripts/simulate-rfid.js tap
# Replay tap terakhir, tidak membuat tap baru atau toggle.
.\scripts\docker.ps1 compose run --rm --no-deps backend node scripts/simulate-rfid.js replay
```

Container `--rm` hilang setelah selesai; `logs`/`stop` pada container yang sudah selesai dapat melaporkan tidak ditemukan. Checkpoint tetap di PostgreSQL. Ctrl+C pada `logs -f` hanya keluar dari penampil log. SIGTERM runner tidak membuat event penutup. Demo menolak mulai bila sesi masih terbuka; gunakan tap eksplisit. Tidak ada auto-start. Batas keseluruhan proses empat menit, retry maksimal tiga dengan identitas/isi sama. Bila pending ada, run berikutnya **hanya** memulihkan pending kemudian selesai; perhatikan output sebelum meminta tap baru. Checkpoint hilang sementara histori ada menyebabkan gagal aman, bukan reset stream/counter.

Counter meter baru mengintegrasikan daya virtual sebelumnya × waktu aktual dalam nano-kWh, mempertahankan sisa pecahan lintas restart. Daya demo 600→900→300 W, tegangan 220 V; model beban tetap berlaku selama jeda offline, yang tetap dianggap gap oleh perhitungan kualitas backend. Tap tidak membawa angka energi. Sesi dengan batas/rangkaian sensor kurang tetap berakhir oleh tap, tetapi energi `null`; tidak ada tagihan. Sesi review tidak ditutup otomatis dan belum memiliki alur koreksi administratif.

Dashboard: http://127.0.0.1:3000 → login **owner@simulation.local** dengan password lokal → **Riwayat fasilitas RFID**. Pilih fasilitas di atas. Status, waktu akhir dan energi berubah melalui polling lima detik tanpa refresh manual. Filter rentang pada halaman ini berlabel UTC; waktu tabel ditampilkan WIB. Tenant memakai dashboard monitoring existing; UI histori tenant belum disediakan, tetapi API sesi dibatasi peserta sendiri.

API terautentikasi (cookie sesi existing, `Cache-Control: no-store`):

- `GET /api/facilities?limit=50&after=<UUID>` — fasilitas owner atau bangunan occupancy tenant saat ini, ketersediaan tanpa identitas penghuni.
- `GET /api/usage-sessions?from=2026-09-17T00:00:00Z&to=2026-09-18T00:00:00Z&facility_id=00000000-0000-4000-8000-000000000303&limit=50` — sesi overlap `[from,to)`, maksimum 31 hari; filter `status=active|completed|review`, lanjutkan `next_cursor`. Limit maksimum 100.
- `GET /api/usage-sessions/87908952-f4ec-402f-9cd2-fc1060fbfaea` — ID sesi demo yang benar-benar tersimpan pada verifikasi 17 September. Owner properti dan tenant peserta dapat membaca, pihak lain 404. ID contoh berlaku pada database lokal ini.

Contoh field respons sesi terverifikasi: `status: "completed"`, `duration_seconds: "120.025000"`, `energy_status: "valid"`, `energy_kwh: "0.025004000"`. Angka desimal dikirim string untuk mempertahankan presisi. Sesi tanpa bukti batas memiliki `energy_status: "unavailable"`, `energy_kwh: null`, dan `energy_reason`. UI tidak mengganti null menjadi nol. Field `meta.source` menandai simulasi; UID/payload tidak dikembalikan.

Pengujian:

```powershell
.\scripts\docker.ps1 compose exec -T -e INTEGRATION_DB=1 backend npm test
.\scripts\docker.ps1 compose exec -T backend npm run smoke
# Snapshot read-only untuk membandingkan sebelum/sesudah restart:
.\scripts\docker.ps1 compose exec -T backend node scripts/verify-rfid.js snapshot
# Uji MQTT/API setelah ada sedikitnya satu demo lengkap berenergi valid:
.\scripts\docker.ps1 compose run --rm --no-deps `
  -v "${PWD}/.local/secrets/owner_login_password:/run/test/owner_password:ro" `
  -e AUTH_TEST_PASSWORD_FILE=/run/test/owner_password `
  -e AUTH_TEST_BASE_URL=http://backend:3000 `
  backend node scripts/verify-rfid.js
```

Verifier MQTT menambah catatan penolakan untuk pesan uji, tetapi tidak menambah sesi/pembacaan. Fixture suite PostgreSQL memakai transaksi rollback; bukan reset database. Counter identity sequence PostgreSQL dapat bertambah walaupun fixture di-rollback. Pengujian crash hardware, banyak reader bersamaan dan gangguan panjang belum tercakup; lihat HANDOFF.

## Backend data master owner

Setelah image yang memuat migration 008–011 tersedia:

```powershell
.\scripts\docker.ps1 compose run --rm --no-deps backend npm run migrate
.\scripts\docker.ps1 compose up -d --no-deps --force-recreate --wait backend
.\scripts\docker.ps1 compose exec -T -e INTEGRATION_DB=1 backend npm test
```

Migration bersifat non-destruktif dan tidak menjalankan seed. Endpoint, lifecycle, invitation dan batas implementasi dijelaskan di `MASTER-DATA-BACKEND.md`. UI Administrasi tersedia untuk owner; gunakan reason, CSRF, versi dan data manual sesuai API. Record `source=simulation` sengaja read-only.

Sejak migration 012, setiap mutasi `/api/owner` juga wajib menyertakan header `Idempotency-Key` UUID baru untuk setiap aksi. Pertahankan key saat retry setelah timeout; jangan buat key baru untuk retry aksi yang sama. `409 idempotency_in_progress` berarti tunggu lalu coba kembali dengan key sama, sedangkan `409 idempotency_key_conflict` berarti key sudah dipakai untuk endpoint/payload berbeda. Frontend Administrasi kini mempertahankan key dan payload di memori form saat retry. Jangan menutup/reload form ketika hasil belum pasti tanpa memeriksa daftar sebelum aksi baru.

Untuk membuktikan retry HTTP lintas restart secara nyata, verifier `scripts/verify-owner-idempotency-restart.js` menjalankan fase `before`, lalu backend direstart, lalu fase `after`. Fase `before` membuat satu properti dan kamar uji **permanen** yang terpisah dari dataset pengamatan; jangan jalankan ulang `before` setelah berhasil. Gunakan password owner lokal sebagai mount read-only, tanpa mencetaknya:

```powershell
$verifyArgs = @('--rm','--no-deps','-v',"${PWD}/.local/secrets/owner_login_password:/run/test/owner_password:ro",'-v',"${PWD}/scripts/verify-owner-idempotency-restart.js:/app/scripts/verify-owner-idempotency-restart.js:ro",'-e','AUTH_TEST_PASSWORD_FILE=/run/test/owner_password','-e','AUTH_TEST_BASE_URL=http://backend:3000','backend','node','scripts/verify-owner-idempotency-restart.js')
.\scripts\docker.ps1 compose run @verifyArgs before
.\scripts\docker.ps1 compose restart backend
.\scripts\docker.ps1 compose up -d --no-deps --wait backend
.\scripts\docker.ps1 compose run @verifyArgs after
```

Pada database lokal saat ini fase `before` sudah selesai; untuk mengulang verifikasi baca-saja gunakan `after` saja. Hasil 21 September: status awal dan retry 201, satu kamar dan satu audit, respons identik. Suite PostgreSQL nyata 23/23 lulus; fingerprint sesi, event, dan seluruh pembacaan tidak berubah.

Verifikasi ulang 19 September 2026 memakai PostgreSQL/MQTT Docker nyata menghasilkan 21 test lulus tanpa skip. Demo MQTT terbaru tersimpan sebagai sesi `e462e6a9-e2c6-42b4-b14f-e20675dc71bb` dengan status selesai dan energi simulasi valid `0.025004416` kWh. Setelah restart PostgreSQL, MQTT, dan backend, snapshot sesi/event/reading tetap identik; replay, konflik, dan pesan invalid tidak mengubah data canonical. ID tersebut hanya berlaku pada database lokal yang sama.

Akun uji lokal adalah `owner@simulation.local` dan `tenant@simulation.local`. Gunakan password dari `.local/secrets/owner_login_password` dan `.local/secrets/tenant_login_password`; keduanya diabaikan Git dan tidak boleh disalin ke dokumentasi. Provisioning RFID tidak mengaktifkan akun atau occupancy secara diam-diam.

### Kredensial akun simulasi lokal

Untuk mengganti password akun existing secara eksplisit, perbarui secret dengan `scripts/provision-local.ps1 -Role owner -ResetPassword` dan `-Role tenant -ResetPassword`, lalu jalankan updater di bawah. Updater hanya menerima database development, mencari setiap user berdasarkan ID dan email lama/baru, menolak kecocokan hilang/ganda, dan memperbarui record user yang sama. Ia tidak membuat user, occupancy, audit, reading, sesi, atau tagihan.

```powershell
.\scripts\docker.ps1 compose build backend
.\scripts\docker.ps1 compose run --rm --no-deps `
  -v "${PWD}/scripts/update-simulation-credentials.js:/app/scripts/update-simulation-credentials.js:ro" `
  -v "${PWD}/.local/secrets/owner_login_password:/run/local/owner:ro" `
  -v "${PWD}/.local/secrets/tenant_login_password:/run/local/tenant:ro" `
  backend node scripts/update-simulation-credentials.js /run/local/owner /run/local/tenant
```

Login baru dan penolakan alamat lama dapat diperiksa dengan `scripts/verify-simulation-credentials.js`; mount kedua password file lokal sebagai read-only dan set `AUTH_OWNER_PASSWORD_FILE`, `AUTH_TENANT_PASSWORD_FILE`, serta `AUTH_TEST_BASE_URL=http://backend:3000`. Script provisioning umum juga mengenali email simulasi lama dan baru sebagai identitas yang sama supaya rerun tidak menggandakan user.

## Verifikasi frontend Administrasi — 23 September 2026

Gunakan build/copy dan perintah test di FRONTEND-ADMIN.md; tidak perlu menjalankan seed, migrasi atau simulator. Container existing sudah diperbarui dengan aset final, image belum rebuild. Akun owner/tenant memakai secret lokal existing. Buat data master uji dengan nama/reason UJI UI, jangan memakai record source=simulation untuk mutasi.

Hasil: build, 19 test frontend dan 2 test master PostgreSQL tanpa skip lulus. Browser owner memverifikasi create/edit, konflik dua tab, timeout/retry, invitation dan lifecycle; tampilan desktop/ponsel serta logout/tenant guard diperiksa. Fingerprint 1457 readings, 4 sesi dan 8 event tetap identik. Rincian fixture dan batas uji ada di FRONTEND-ADMIN.md.

Routing backend diperbaiki 24 September 2026: guard owner hanya mencakup `/api/owner`; router monitoring/RFID berikutnya kembali menerima tenant dan menerapkan scope occupancy existing. Verifier HTTP nyata dapat dijalankan tanpa mutasi histori:

```powershell
.\scripts\docker.ps1 compose run --rm --no-deps `
  -v "${PWD}/scripts/verify-routing-live.js:/app/scripts/verify-routing-live.js:ro" `
  -v "${PWD}/.local/secrets/owner_login_password:/run/test/owner_password:ro" `
  -v "${PWD}/.local/secrets/tenant_login_password:/run/test/tenant_password:ro" `
  -e AUTH_OWNER_PASSWORD_FILE=/run/test/owner_password `
  -e AUTH_TENANT_PASSWORD_FILE=/run/test/tenant_password `
  -e AUTH_TEST_BASE_URL=http://backend:3000 `
  backend node scripts/verify-routing-live.js
```

Verifier memeriksa login owner/tenant; tenant rooms, meters, latest, readings, daily, facilities dan usage sessions; 403 untuk root/turunan `/api/owner`; owner GET Administrasi; logout dan 401. Form move occupancy tersedia; sukses via browser belum diuji dengan fixture tenant bebas overlap. Tidak melakukan commit/push/deploy atau perubahan volume.

## Backend billing v1

Migration 013–019 menambah provenance, tarif temporal, periode/revisi, snapshot hasil dan guard histori. Migration tidak membuat tarif atau tagihan. Jalankan migration dan verifikasi tanpa seed/reset:

```powershell
.\scripts\docker.ps1 compose run --rm --no-deps backend npm run migrate
.\scripts\docker.ps1 compose up -d --no-deps --force-recreate --wait backend
.\scripts\docker.ps1 compose exec -T -e INTEGRATION_DB=1 backend npm test
.\scripts\docker.ps1 compose exec -T backend node scripts/verify-billing-history.js
.\scripts\docker.ps1 compose exec -T backend node scripts/simulate.js 2026-09-12 --verify-only
```

Endpoint owner: `GET|POST /api/owner/tariff-schedules`, retire tarif, `GET|POST /api/owner/billing-periods`, detail, recalculate, finalize, dan corrections. Daftar pembayaran final tersedia pada `GET /api/owner/bill-shares` dengan filter opsional `period_id`, `room_id`, `tenant_id`, dan `payment_status=unpaid|paid`. Lifecycle manual memakai `POST /api/owner/bill-shares/:id/mark-paid` (`row_version`, catatan opsional, reason) dan `/unmark-paid` (`row_version`, reason wajib). Semua POST wajib sesi owner, CSRF, UUID `Idempotency-Key`, reason, serta `row_version`. Tenant membaca tagihan final dan status pembayaran miliknya lewat `GET /api/billing-periods` dan `GET /api/billing-periods/:id`.

Laporan owner tersedia pada `GET /api/owner/reports/billing`. Filter opsional: `period_id`, pasangan `from`/`to` RFC3339 dengan rentang maksimum 366 hari, `room_id`, dan `payment_status=unpaid|paid`. Respons berisi baris final, agregat total, dan grouping per kamar; maksimal 5.000 baris. Endpoint hanya membaca snapshot billing final dan state pembayaran, tidak menghitung ulang atau mengubah histori. Buka dashboard owner → **Laporan**, terapkan filter, lalu pilih **Ekspor CSV** untuk mengekspor hasil yang sedang tampil.

Tidak ada tarif production bawaan dan `production_max_gap_seconds` sengaja null. Karena itu data production tidak dapat finalized sampai policy sampling hardware ditetapkan. Data simulation hanya preview dan selalu ditolak saat finalize. Test billing memakai transaksi rollback; perintah verifier fingerprint hanya membaca data. Rincian kontrak dan reason ada di `BILLING-DESIGN.md`.

## Kesiapan ESP32 dan MQTT produksi

Kontrak final ada di `ESP32-MQTT-CONTRACT.md`. Topic production adalah `smartbilling/v1/devices/{device_uid}/readings`; topic simulator lama tetap terpisah. Sebelum memasang ESP32, periksa mapping owner melalui API:

```text
GET /api/owner/hardware-readiness?device_uid=esp32-kamar-01&at=2026-09-24T00:00:00Z
```

Atau gunakan CLI baca-saja di container:

```powershell
.\scripts\docker.ps1 compose exec -T backend node scripts/verify-device-readiness.js <device_uid> <owner_uuid> 2026-09-24T00:00:00Z
```

`ready=true` mensyaratkan device aktif, sedikitnya satu installation aktif, channel tidak ganda, meter asset tersedia dan belum retired. Pemeriksaan ini tidak menguji Wi-Fi, TLS, broker dari lokasi perangkat, NTP, kalibrasi, atau pembacaan sensor fisik.

Verifier HTTP nyata dengan akun owner lokal:

```powershell
.\scripts\docker.ps1 compose run --rm --no-deps `
  -v "${PWD}/scripts/verify-hardware-readiness-live.js:/app/scripts/verify-hardware-readiness-live.js:ro" `
  -v "${PWD}/.local/secrets/owner_login_password:/run/test/owner_password:ro" `
  -e AUTH_TEST_PASSWORD_FILE=/run/test/owner_password `
  -e AUTH_TEST_BASE_URL=http://backend:3000 `
  backend node scripts/verify-hardware-readiness-live.js sim-running-01 2026-09-24T00:00:00Z
```

Contoh konfigurasi placeholder ada di `docs/examples/esp32-config.example.h`; jangan memasukkan credential asli ke repository.

## Monitoring kesehatan perangkat

Nilai development default tersedia di `.env.example` dan `compose.yaml`:

```dotenv
DEVICE_HEALTH_ONLINE_SECONDS=180
DEVICE_HEALTH_OFFLINE_SECONDS=900
```

`MONITORING_MAX_GAP_SECONDS=120` dipakai untuk alert gap di halaman kesehatan, bukan untuk memfinalisasi billing production. Buka dashboard owner lalu pilih **Kesehatan Perangkat**. Rentang maksimum API adalah 31 hari; filter status, device, kamar, dan status alert diterapkan di backend dengan scope owner.

Endpoint:

- `GET /api/owner/device-health`
- `POST /api/owner/device-health/alerts/review` (CSRF, UUID `Idempotency-Key`, `alert_key`, catatan wajib, `row_version`)

Verifikasi owner read-only dan penolakan tenant:

```powershell
.\scripts\docker.ps1 compose run --rm --no-deps `
  -v "${PWD}/scripts/verify-device-health-live.js:/app/scripts/verify-device-health-live.js:ro" `
  -v "${PWD}/.local/secrets/owner_login_password:/run/test/owner_password:ro" `
  -e AUTH_TEST_PASSWORD_FILE=/run/test/owner_password `
  -e AUTH_TEST_BASE_URL=http://backend:3000 `
  backend node scripts/verify-device-health-live.js

.\scripts\docker.ps1 compose run --rm --no-deps `
  -v "${PWD}/scripts/verify-device-health-live.js:/app/scripts/verify-device-health-live.js:ro" `
  -v "${PWD}/.local/secrets/tenant_login_password:/run/test/tenant_password:ro" `
  -e AUTH_TEST_PASSWORD_FILE=/run/test/tenant_password `
-e AUTH_TEST_EMAIL=tenant@simulation.local `
  -e EXPECT_OWNER_FORBIDDEN=1 `
  -e AUTH_TEST_BASE_URL=http://backend:3000 `
  backend node scripts/verify-device-health-live.js
```

Migration 021 hanya menambah tabel event/review dan guard append-only; tidak mengubah reading, sesi RFID, tagihan, atau data simulasi lama.

## Aktivasi akun tenant

Owner membuat tenant dari **Administrasi → Tenant**. Layar sukses menampilkan tautan satu kali berbentuk `http://127.0.0.1:3000/#/aktivasi?token=…`; bagikan tautan secara pribadi sebelum menutup layar. Belum ada pengiriman email otomatis. Tenant membuka tautan, memasukkan password minimal 8 karakter dua kali, lalu memilih **Aktifkan akun**. Password lebih panjang tetap disarankan. Setelah berhasil, tenant kembali ke login dan memakai email yang diberikan owner.

Token aktivasi hanya berada di fragment URL, tidak dikirim ke server saat halaman dimuat, lalu dibuang dari address bar oleh halaman. API tetap memvalidasi token sekali pakai dan masa kedaluwarsanya. Token yang hilang/kedaluwarsa memerlukan undangan baru. Formulir meminta CSRF dan tidak menyimpan password dalam bentuk teks.

## Mengganti nama properti

Login sebagai owner, buka **Administrasi → Properti**, pilih properti, lalu **Lihat detail → Ubah nama properti**. Isi nama baru dan alasan perubahan. ID properti beserta relasi dan histori tetap sama. Nama baru muncul di pilihan properti pada Billing. Perubahan memakai pemeriksaan owner, CSRF, Idempotency-Key, row version, dan audit log; tenant tidak dapat membuka endpoint ini.
