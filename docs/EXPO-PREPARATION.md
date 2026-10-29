# Persiapan database bersih untuk expo

Keputusan pengguna, 18 Oktober 2026: simpan database pengujian sebagai arsip, uji aplikasi dengan database bersih di Docker, lalu gunakan PostgreSQL baru ketika deploy ke Railway. Database lama tidak dihapus atau diimpor utuh ke cloud.

## Lingkungan yang tersedia

Alamat broker dashboard sekarang **192.168.1.9:1884**, mengikuti DHCP Binding komputer pada router. Catatan `.8` di bawah berasal dari konfigurasi pengujian awal; gunakan wrapper dan verifier yang sudah diperbarui ke `.9` untuk menjalankan kembali dashboard PZEM. Broker diagnostik lama tidak dipindahkan dalam perubahan ini.

| Lingkungan | Dashboard | Data |
|---|---|---|
| Pengujian lama / arsip | http://127.0.0.1:3000 | Semua simulasi, fixture, histori dan akun lama |
| Rehearsal bersih | http://127.0.0.1:3001 | Owner, Kamar 1, dua tenant manual, membership/occupancy terpilih, dan PZEM nyata Kamar 1 |
| Railway | Belum dibuat | Nanti PostgreSQL baru, schema dan master operasional yang disepakati |

Project Docker rehearsal `smartbilling-expo-local` memakai network, volume, password database/broker, session secret, cookie sesi, dan broker sendiri. Konfigurasi dasar tidak membuka port PostgreSQL/MQTT host. Sesudah integrasi PZEM 18 Oktober, override LAN yang disetujui membuka broker rehearsal **192.168.1.8:1884**, dengan firewall hanya Wi-Fi/subnet192.168.1.0/24. Dashboard hanya bind localhost. Broker PZEM tes `192.168.1.8:1883`, broker aplikasi lama, dan Railway tetap terpisah. Panduan hardware aktual: [PZEM-DASHBOARD-TEST.md](PZEM-DASHBOARD-TEST.md).

Login owner rehearsal menggunakan email/password existing yang sama; nilainya tidak dituliskan ulang di panduan. Nama tampilan pada **salinan baru** dinetralkan menjadi **Owner** dan **Kost**. ID serta database sumber tidak diubah. Nama tenant manual tetap sesuai pilihan pengguna. Status akun dan hash password disalin, tanpa membuat password baru. Invitation/token aktivasi lama tidak disalin; tenant yang belum aktif memerlukan invitation baru dari owner pada lingkungan baru.

Bootstrap awal tidak membuat device, meter, reader, kartu RFID, fasilitas, reading, sesi RFID, tarif, tagihan atau transaksi token. Setelah bootstrap, satu device/aset/pemasangan PZEM nyata didaftarkan ke Kamar1 melalui API dan pembacaan production sudah tersimpan. Fasilitas lain didaftarkan setelah identitas/wiring/channel dipastikan. Data yang belum tersedia tidak diganti nol buatan.

## Backup dan bukti pemulihan

Backup custom PostgreSQL berada di `.local/archives/<waktu>/database.dump`. Folder diabaikan Git dan memuat data privat termasuk hash akun; jangan unggah ke repository atau membagikannya sebagai contoh.

- `manifest.json`: waktu, asal, ukuran, SHA-256 dan status pemulihan.
- `fingerprint.json`: jumlah/hash baris 38 tabel sebelum backup, tanpa isi baris.
- `restore-verification.json`: hasil restore pada database sementara terisolasi; seluruh 38 tabel cocok.
- `.local/expo-local/latest-archive.json`: menunjuk backup terbaru.

Backup baru dapat dibuat tanpa menghentikan database sumber:

```powershell
node scripts/archive-local-db.js
```

Setiap run membuat folder baru. Status `backup_created` belum membuktikan restore. Verifikasi backup baru melalui service sementara yang kosong:

```powershell
.\scripts\docker.ps1 compose -f compose.expo-local.yaml --profile archive-check up -d --wait postgres-archive-check
node scripts/verify-local-archive.js
.\scripts\docker.ps1 compose -f compose.expo-local.yaml stop postgres-archive-check
```

Verifier menolak target berisi tabel dan tidak membersihkannya otomatis. Service memakai tmpfs; penghentian membuang salinan sementara hasil restore, sedangkan backup tetap ada. Database operasional dan sumber tidak disentuh.

## Menjalankan kembali rehearsal

Persiapan pertama pada mesin ini sudah selesai. Untuk pemakaian berikutnya:

```powershell
.\scripts\expo-pzem.ps1 up -d --wait postgres mqtt backend
node scripts/verify-pzem-dashboard.js
```

Wrapper `expo-pzem.ps1` mempertahankan override LAN1884. Verifier awal `verify-expo-local.js` hanya sesuai fase sebelum registrasi hardware karena mengharapkan device/meter/readings kosong; bukan pemeriksaan fase PZEM sekarang. Konfigurasi/credential privat dan database tidak ikut clone Git, sehingga komputer baru perlu persiapan tersendiri.

Jangan menjalankan seed demo atau simulator pada stack ini. Bootstrap master tidak perlu diulang; ia memeriksa target kosong dan menolak menimpa data existing. Mematikan rehearsal tanpa menghapus volume:

```powershell
.\scripts\expo-pzem.ps1 stop
```

Pembuatan pertama menggunakan `init-expo-local.js`, build backend, migration existing 001–023, dan `prepare-expo-master.js`. Seleksi ID tersimpan privat di `.local/expo-local/selection.json`. Ekspor master sementara tidak dicetak dan dibuang setelah bootstrap; receipt hanya memuat jumlah dan hash ekspor. Tidak menjalankan `seed:demo`, mematikan trigger, atau mengubah migration lama.

Build rehearsal memakai `VITE_DATA_MODE=operational`: daftar menampilkan data API lengkap tanpa checkbox/filter arsip. Backend `DATA_MODE=operational` hanya subscribe topik sensor/RFID produksi dan mengabaikan namespace simulasi. Default build/runtime existing tetap mode arsip untuk pengujian. Mode data ini **bukan** konfigurasi keamanan production: rehearsal masih `APP_ENV=development` dan HTTP localhost.

## Sebelum Railway

Rehearsal membuktikan schema kosong dapat diisi master terpilih, login/API bekerja, data tidak bercampur simulasi, dan volume bertahan setelah restart. Tidak diperlukan sinkronisasi database dua arah dengan cloud.

Pekerjaan deployment berikutnya, belum dijalankan:

1. Siapkan runtime/migration production. `server.js`/`migrate.js` masih memanggil guard development; koneksi/secret memakai pola berkas lokal. Jangan melewati guard dengan menyamarkan Railway sebagai database development.
2. Tentukan akun/email operasional dan bootstrap/invitation cloud. Jangan memakai kredensial simulasi sebagai default production atau menyalin sesi login lama.
3. Atur origin HTTPS, trust proxy yang sesuai dan cookie Secure. Cookie rehearsal terpisah hanya mencegah tab 3000/3001 saling mengganti sesi.
4. Buat PostgreSQL Railway baru, jalankan migration tanpa seed demo, lalu master terpilih. Backup lama tidak di-restore penuh ke cloud.
5. Siapkan broker cloud dengan autentikasi/ACL per perangkat, endpoint dan TLS yang sesuai. Backend memakai koneksi internal; firmware membutuhkan endpoint terjangkau ESP32. Port HTTPS dashboard bukan port MQTT.
6. Pindahkan master perangkat/channel/meter/fasilitas/kartu yang benar secara terencana. Firmware diagnostik `ESP32_PZEM_MQTT_Test` tidak memenuhi kontrak; firmware `firmware/pzem-dashboard` sudah diuji ingest nyata lokal dengan NTP/boot/sequence/counter epoch/QoS1, tetapi masih perlu endpoint/auth/TLS cloud. RFID fisik belum teruji.
7. Uji ingest, deduplikasi, owner/tenant, tap awal/akhir, histori, persistence dan backup cloud sebelum expo. Pengamatan lokal nyata sebelum cloud siap perlu migrasi terencana dengan identitas/deduplikasi tetap; pembacaan broker tes tidak otomatis tersimpan di database.

Referensi: [PostgreSQL Railway](https://docs.railway.com/databases/postgresql), [Docker Compose ke Railway](https://docs.railway.com/guides/docker-compose), [TCP Proxy](https://docs.railway.com/networking/tcp-proxy). Periksa kembali detail platform saat implementasi deployment. Tidak ada resource, domain, atau deployment cloud yang dibuat pada tahap rehearsal ini.
