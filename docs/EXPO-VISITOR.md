# Akun pengunjung expo

Keputusan pengguna 4 November 2026: pengunjung dapat membuka **semua halaman owner dalam mode hanya baca**, melalui login terpisah. Fitur ini tidak membuat data simulasi atau mengganti akun owner. Akun sudah diaktifkan pada dashboard lokal port3001 dan Railway pada4November2026, dengan expiry6November2026 pukul00.00WIB. Rincian aktivasi/bukti ada di HANDOFF.md.

## Hak akses

- Role database `viewer`, dengan satu grant `owner_viewers` yang menunjuk owner. Seluruh properti milik owner tersebut dapat dibaca; properti owner lain tetap dibatasi oleh query API existing.
- Monitoring, grafik/histori, fasilitas RFID, tagihan dan pembayaran, token bulanan, laporan, kesehatan perangkat, serta administrasi tetap dapat dibuka. Rincian, filter dan ekspor laporan di browser tetap berfungsi. Nama, email penghuni dan rincian tagihan yang memang terlihat pada halaman owner juga dapat terlihat oleh pengunjung.
- API hanya meneruskan GET/HEAD pada daftar endpoint baca yang diperiksa. Endpoint baru tertutup secara default. POST/PATCH/PUT/DELETE bisnis ditolak HTTP403 `viewer_read_only` sebelum handler, termasuk relay, finalisasi, pembayaran dan administrasi. Login/logout tetap tersedia; aktivasi undangan dari sesi viewer ditolak.
- `/api/auth/me` dan header akun tetap memakai ID viewer asli. Hanya handler baca yang menerima konteks owner tersimpan di grant, dengan `read_only=true`; konteks tidak berasal dari body, query atau header pengguna. UI memakai menu owner dan penanda **Pengunjung expo · Hanya baca**. Pengunjung boleh membuka serta mencoba isi formulir sebagai **Pratinjau pengunjung**; tombol Simpan/konfirmasi pengiriman tetap nonaktif dan `MutationForm` menahan submit termasuk Enter. Tombol aksi langsung yang menulis tetap dinonaktifkan. API adalah pembatas akses utama.
- Grant diperiksa setiap permintaan. Expiry, pencabutan atau owner nonaktif memutus pembacaan berikutnya, termasuk sesi yang sudah login. Sesi mengikuti batas absolut delapan jam dan, sejak5November2026, **15menit tanpa aktivitas manusia**; polling tidak memperpanjang sesi. Lihat [AUTH-SESSIONS.md](AUTH-SESSIONS.md). Data yang telah dilihat/diunduh tidak dapat ditarik kembali.

## Persiapan operator

1. Backup database aktif dan uji pemulihan ke PostgreSQL terisolasi. Jangan menimpa data cloud baru dengan snapshot lama.
2. Bangun/deploy backend dari source terbaru yang juga mempertahankan perubahan TLS/relay existing. Pre-deploy menjalankan `node scripts/migrate.js`; migration034 menambah role/grant tanpa mengubah data sensor, sesi atau billing. Jangan mengubah migration001–033 atau checksum existing. Deployment cloud sebelumnya memakai byte LF; periksa checksum source artifact terhadap `schema_migrations` sebelum deploy.
3. Sediakan password yang diminta pengguna sebagai berkas privat ignored (`.local/` atau secret runtime). Jangan menaruhnya pada command-line, dokumentasi, log, frontend atau Git. Hash scrypt dibuat utilitas berikut; utilitas tidak dijalankan otomatis saat startup.

Dengan konfigurasi database environment yang benar, isi parameter berikut melalui environment privat:

```text
VIEWER_EMAIL=<email pengunjung>
VIEWER_OWNER_ID=<UUID owner aktif>
VIEWER_EXPIRES_AT=<timestamp berzona waktu setelah expo>
VIEWER_PASSWORD_FILE=<path berkas password privat>
```

```powershell
node scripts/provision-owner-viewer.js create
```

Utilitas menolak email existing dan tidak menimpa akun/password lama. `VIEWER_EXPIRES_AT` wajib berada di masa depan; tidak ada expiry tersembunyi atau akun aktif dari migration. Untuk expo5November, usulan default implementasi adalah **6November2026 pukul00.00WIB** (`2026-11-05T17:00:00Z`); catat waktu aktual saat provisioning.

4. Verifikasi melalui HTTPS: login visitor, identitas `/auth/me`, keenam menu, detail/rentang/filter, API asing404/kosong, mutasi403, dan login owner/tenant tetap normal. Logout sesi pemeriksaan. Jangan menguji kontrol fisik atau finalisasi produksi untuk membuktikan penolakan viewer; gunakan fixture terisolasi terlebih dahulu.

## Mencabut akses

Isi `VIEWER_EMAIL` dan konfigurasi database target yang sama, lalu:

```powershell
node scripts/provision-owner-viewer.js revoke
```

Pencabutan menandai grant dan menghapus sesi login viewer tersebut. Password owner tidak perlu diubah; histori pengamatan, data master dan tagihan tidak dihapus. Mengulangi revoke terhadap viewer existing aman.

## Pemeriksaan lokal

```powershell
npm run check
npm test
npm run build
.\scripts\docker.ps1 build -t smartbilling-viewer-review:20261104 .
node scripts/test-owner-viewer-isolated.js
```

Runner membuat PostgreSQL17 sementara dengan tmpfs, tanpa port publik, jaringan luar, volume atau MQTT aplikasi. Migration dijalankan dua kali untuk idempotensi. Fixture di-rollback; container dihentikan saat selesai. Hasil privat ada di `.local/owner-viewer-tests/`. Host yang melarang HTTP loopback pada sandbox dapat memerlukan izin menjalankan tes HTTP lokal di luar sandbox; jangan mengganti assertion agar kegagalan jaringan dianggap lulus.
