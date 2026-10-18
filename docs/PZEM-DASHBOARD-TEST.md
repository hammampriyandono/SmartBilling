# Tes PZEM nyata ke dashboard Kamar 1

Status 18 Oktober 2026: **PZEM nyata sudah mengirim ke dashboard Kamar 1**, database rehearsal bersih port 3001. Firmware diunggah ke ESP32-C3 COM4 dan MAC aktual cocok dengan registrasi. Broker LAN dan firewall terbatas aktif sesuai izin eksplisit pengguna. Pembacaan pertama tersimpan pada **16.24.46 WIB**, berikutnya **16.25.46 WIB**. Baris pertama bertahan setelah restart PostgreSQL dan backend, lalu sampel baru tetap masuk. Ini uji integrasi lokal; Railway belum dikerjakan.

## Jalur pengujian

ESP32-C3 → MQTT dashboard LAN → backend rehearsal → PostgreSQL → dashboard http://127.0.0.1:3001.

- UID sesuai MAC yang diverifikasi pada upload aktual: `esp32-pzem-10003bd0ccf0`. Firmware memeriksa MAC aktual sebelum terhubung; tidak boleh mengirim sebagai identitas chip lain.
- Topik: `smartbilling/v1/devices/esp32-pzem-10003bd0ccf0/readings`.
- Kamar 1, channel 1, PZEM RX20/TX21 sesuai sketch diagnostik existing.
- Endpoint LAN aktif: `192.168.1.8:1884`, firewall hanya interface Wi-Fi/subnet `192.168.1.0/24`. MQTT TCP belum TLS, khusus uji LAN ini.
- Broker diagnostik lama `192.168.1.8:1883` dan topik `smartbilling/test/pzem/kamar2` tetap terpisah. Tidak ada bridge atau konversi payload lama dengan timestamp/boot/sequence buatan.

Device, meter asset dan installation didaftarkan melalui API owner dengan CSRF, Idempotency-Key persisten dan audit. Readiness `ready=true`; itu hanya membuktikan mapping, bukan sensor terkoneksi. Receipt privat `.local/expo-pzem/registration.json`, readiness `.local/expo-pzem/readiness.json`. Tidak membuat pembacaan pengganti. Dashboard/DB/broker rehearsal sempat berhenti; hanya stack rehearsal dihidupkan kembali agar registrasi dapat dilakukan.

## Firmware terpasang

Sketch privat: `.local/expo-pzem/PZEM_Dashboard/PZEM_Dashboard.ino`. `secrets.h` mengambil Wi-Fi existing tanpa mencetaknya dan memakai password MQTT baru yang terpisah. Credential, binary dan log berada di `.local`, diabaikan Git. Source tanpa credential ada di `firmware/pzem-dashboard`.

Kompilasi Arduino CLI, core ESP32 **3.3.12**, board `esp32:esp32:esp32c3:CDCOnBoot=cdc`, library **MQTT 2.5.2 (256dpi)** lulus: flash **1.017.133 byte (77%)**, global RAM **41.848 byte (12%)**. Library lokal berada di `.local/expo-pzem/arduino-user`; kompilasi melalui CLI menggunakan config yang disiapkan. Arduino IDE memerlukan library MQTT yang sama jika upload dilakukan melalui IDE, bukan PubSubClient.

```powershell
.\.local\arduino-tools\arduino-cli.exe compile --fqbn esp32:esp32:esp32c3:CDCOnBoot=cdc --config-file .local/expo-pzem/arduino-cli.yaml --build-path .local/expo-pzem/build .local/expo-pzem/PZEM_Dashboard
```

Upload COM4 berhasil, hash flash terverifikasi dan chip di-reset normal. Tidak melakukan erase-all, menghapus NVS atau reset counter PZEM. Firmware mencetak jumlah byte respons yang kurang dari 25, serta membedakan respons lengkap yang gagal validasi. USB hanya diperlukan untuk upload/Serial Monitor; setelah upload, ESP32 dapat memakai catu daya rangkaian existing dan mengirim melalui Wi-Fi. Matikan daya saat mengubah sambungan, jangan memasang dua sumber catu tanpa memastikan rancangan board mendukungnya.

Firmware membaca register PZEM saja, memvalidasi panjang/alamat/CRC, mempertahankan energi sebagai integer Wh lalu string kWh kumulatif, publish QoS1 retain=false dengan UTC NTP, boot UUID v4 dan sequence per boot. Counter turun menaikkan counter_epoch persisten; tidak mengirim perintah reset PZEM. Tanpa NTP atau frame valid, tidak membuat sampel.

Interval awal **60 detik**: sampel pertama segera setelah NTP siap, berikutnya tiap interval. Queue NVS maksimum **8 sampel**, termasuk payload/timestamp/identitas asli untuk retry. PUBACK broker menghapus head queue; itu belum bukti DB tersimpan. Reboot membuat boot baru tetapi pending lama dikirim dahulu. Queue penuh mencatat kehilangan melalui serial; tidak mengarang sampel pengganti. Power-cut, NVS endurance, clock/NTP nyata dan antrean penuh belum diuji fisik. Ini firmware uji integrasi, bukan klaim kesiapan produksi penuh.

Library dan perilaku publish QoS didasarkan pada [dokumentasi 256dpi MQTT](https://github.com/256dpi/arduino-mqtt). Kontrak backend: [ESP32-MQTT-CONTRACT.md](ESP32-MQTT-CONTRACT.md).

## Akses LAN yang disetujui

Pengguna kemudian memberikan izin eksplisit untuk bind `192.168.1.8:1884` dan inbound TCP1884 hanya Wi-Fi `192.168.1.0/24`. Overlay diterapkan hanya pada broker rehearsal. Pembuatan firewall awal ditolak Windows karena proses bukan administrator; helper yang sama dijalankan melalui UAC lalu konfigurasi rule diperiksa cocok. Firewall tetap aktif, tanpa perubahan profil jaringan. Uji auth/ACL pada endpoint LAN nyata lulus, tanpa pembacaan sensor sintetis.

Untuk menjalankan kembali konfigurasi yang sama:

```powershell
# Aturan ini memerlukan Administrator; tidak mematikan firewall.
.\scripts\enable-pzem-dashboard-firewall.ps1
.\scripts\expo-pzem.ps1 up -d --no-deps --wait mqtt
node scripts/verify-pzem-dashboard-broker.js
```

Gunakan wrapper `expo-pzem.ps1` untuk perintah Compose selanjutnya agar mapping port opt-in tidak hilang. Broker tetap memakai secret backend existing, akun device hanya write topiknya sendiri, observer hanya read, anonymous ditolak. Device tidak diberi credential backend.

Uji autentikasi/ACL sudah **lulus pada container terisolasi `network=none`**, tanpa port host, koneksi ke DB atau perubahan firewall:

```powershell
node scripts/verify-pzem-dashboard-broker-isolated.js
```

Verifikasi ini memakai MQTT.js untuk memeriksa reason code PUBACK MQTT5, bukan exit code mosquitto_pub yang tidak cukup membuktikan ACL rejection. Probe hanya marker status, tidak menghasilkan pembacaan sensor. Uji tersebut bukan bukti LAN/firewall/akses ESP32.

## Memeriksa pembacaan tersimpan

```powershell
node scripts/verify-pzem-dashboard.js
node scripts/verify-pzem-dashboard.js --watch
```

Tanpa pembacaan, utilitas menyatakan mapping siap tetapi belum ada data dan keluar dengan kode 2. Watch berjalan 60 detik, read-only; pembacaan baru mencetak waktu pengukuran/diterima serta nilai aktual dari API. Tidak mencetak credential atau membuat payload sensor. Script baseline `verify-expo-local.js` berasal dari tahap DB kosong dan bukan verifier fase hardware ini; asumsi nol device/meter di sana tidak lagi berlaku.

Di dashboard pilih meter Kamar 1. Bukti berhasil: PostgreSQL `data_source=production`, API latest dan browser menunjukkan pembacaan yang sama. Sampel pertama **213,1 V / 0 A / 0,6 W / 0,018 kWh**, kedua **212,8 V / 0,054 A / 5,4 W / 0,018 kWh**, berjarak 60 detik. Tidak ada MQTT rejection atau kelompok identitas ganda saat pemeriksaan awal. Nilai counter kWh yang sama antar menit dapat terjadi karena resolusi 1 Wh sensor; bukan konsumsi total harian. Grafik/daily masih parsial karena boundary belum lengkap; tidak tersedia bukan konsumsi nol.

Pada pemeriksaan serial awal, MQTT terhubung tetapi pembacaan gagal. Pengguna mengonfirmasi PZEM saat itu belum mendapat daya/tersambung. Setelah firmware akhir terpasang dan pengguna diarahkan kembali ke rangkaian existing, pembacaan nyata muncul tanpa perubahan backend atau payload buatan. Metode catu pada momen sampel tidak dapat dipastikan dari software; koneksi Wi-Fi, sinkronisasi NTP, ingest fisik, tampilan dan persistence reading setelah restart layanan sudah teramati. Kalibrasi, power-cut/NVS penuh, nilai tagihan final dan Railway belum diuji.

Untuk pemakaian berikutnya, PC/Docker dan Wi-Fi harus aktif, alamat PC harus sesuai firmware/bind broker. Start layanan memakai `scripts/expo-pzem.ps1 up -d --wait postgres mqtt backend`. Pemantauan tidak memerlukan USB setelah firmware terpasang. Pemantau lama `monitor-pzem-test.js` masih khusus broker diagnostik1883; untuk jalur dashboard gunakan browser3001 atau `verify-pzem-dashboard.js --watch`.
