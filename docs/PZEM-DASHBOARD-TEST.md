# Tes PZEM nyata ke dashboard Kamar 1

## Alamat koneksi lokal

Konfigurasi komputer diperbarui ke **192.168.1.9:1884** setelah DHCP Binding pada router disiapkan. Alamat `.8` tercatat untuk perangkat lain; jangan menetapkannya kembali pada komputer ini tanpa pemeriksaan jaringan. Firmware privat, bind broker dan rule firewall harus memakai alamat `.9` yang sama. Dashboard tetap http://127.0.0.1:3001.

Untuk menjalankan hanya layanan aplikasi yang diperlukan:

```powershell
.\scripts\expo-pzem.ps1 up -d --wait postgres mqtt backend
node scripts/verify-pzem-dashboard-broker.js
node scripts/verify-pzem-dashboard.js --watch
```

Rule firewall tetap hanya TCP 1884 pada interface Wi-Fi dan subnet 192.168.1.0/24. Perubahan IP tidak memerlukan seed/migrasi ulang atau penghapusan data. Alamat dan bukti pada catatan historis di bawah merekam konfigurasi pengujian sebelumnya.

## Catatan pengujian awal

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

Pengaturan beberapa profil Wi-Fi melalui portal lokal: [PZEM-WIFI-SETUP.md](PZEM-WIFI-SETUP.md). Firmware lama yang belum di-upload dengan fitur ini masih memakai satu jaringan dari `secrets.h`; periksa catatan upload terbaru di HANDOFF untuk status setiap ESP32.

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

## Perangkat tambahan: Kamar 2

Perangkat ketiga untuk pengukuran sebelum percabangan kedua kamar memakai jenis **meter utama**; lihat [PZEM-MAIN-METER.md](PZEM-MAIN-METER.md) untuk identitas dan mappingnya.

Kamar 2 menggunakan ESP32-C3 MAC `10:00:3b:b7:8f:f4`, UID `esp32-pzem-10003bb78ff4`, channel 1. Identitas ini berbeda dari Kamar 1. Registrasi perangkat/aset/pemasangan sudah dibuat melalui API owner; readiness menyatakan mapping siap. Firmware privat ada di `.local/expo-pzem-kamar2/PZEM_Kamar2`, konfigurasi CLI/build di folder privat yang sama. Compile core3.3.12/MQTT existing lulus. Setelah pengguna mengonfirmasi AC dilepas dan hanya USB, upload normal di COM3 berhasil dengan seluruh hash flash terverifikasi. Serial menyatakan MQTT terhubung; observer broker juga menerima status perangkat connected=true. PZEM masih gagal dibaca karena rangkaian belum lengkap; API latest tetap null, bukan nol buatan.

Pembaruan diagnosis28Oktober: firmware Kamar2 ditambah metadata status NTP/UART pada topic status, terpisah dari readings. Upload aplikasi via ROM berhasil/hash verified setelah backup lengkap ROM4MB; jalur stub read sempat gagal tanpa mengubah proteksi. Saat kembali ke catu, Wi-Fi/MQTT/NTP baik tetapi respons awal25byte invalid lalu0byte; latest tetap null dan backend tidak mencatat penolakan. Sambungan RX/TX/GND belum bisa dipastikan pengguna. Periksa jalur/catu dengan tim elektro atau foto terbaru saat semua daya dilepas; jangan menganggap frame invalid sebagai angka sensor valid. Rincian ada pada HANDOFF dan kontrak ESP32-MQTT-CONTRACT.

Hasil akhir28Oktober: pengguna menemukan jumper yang belum terpasang. Sesudah dipasang, API mengonfirmasi Kamar2 online dengan3pembacaan valid/0ditolak; sampel15.41.36WIB menunjukkan15.3W dan counter0.006kWh. Alur sensor→MQTT→backend→PostgreSQL berhasil. Tidak mengganti pin atau melonggarkan validasi parser; detail jalur jumper tidak diverifikasi langsung. Catatan diagnosis di atas adalah kondisi sebelum jumper dipasang.

Broker dapat memuat akun tambahan dari `.local/expo-pzem/extra-devices/`, satu file privat bernama UID dengan password hex48karakter. Folder hanya berisi kredensial broker tambahan, dimount read-only; tidak untuk file lain. UID harus valid, tidak sama dengan UID utama/akun reserved; password harus berbeda dari perangkat utama. Secret tidak ikut Git. ACL setiap perangkat hanya write readings/status UID sendiri; observer lokal dapat read kedua perangkat. Init Kamar1 tetap menyiapkan direktori kosong sehingga konfigurasi satu perangkat masih dapat digunakan. IP/port/firewall tetap192.168.1.9:1884/subnetWi-Fi existing.

Untuk memeriksa Kamar 2 melalui API tanpa membuat data:

```powershell
$env:PZEM_VERIFY_REGISTRATION_FILE='.local/expo-pzem-kamar2/registration.json'
node scripts/verify-pzem-dashboard.js --watch
Remove-Item Env:PZEM_VERIFY_REGISTRATION_FILE
```

Verifier broker mendukung `PZEM_DASHBOARD_UID`, `PZEM_VERIFY_SECRETS`, `PZEM_VERIFY_OBSERVER_PASSWORD_FILE` dan `PZEM_VERIFY_OTHER_UID` untuk menguji kredensial perangkat tambahan dan penolakan publish ke perangkat saudara. Wrapper verifier terisolasi memakai UID/secret directory yang sama, tetap tanpa port host/network luar/database.

Hasil persiapan: kedua akun lulus auth/ACL pada broker terisolasi dan LAN aktual, termasuk penolakan silang Kamar1/Kamar2. Rozan dapat membuka latest meter Kamar2 (200, data null) dan ditolak pada Kamar1 (404). Belum ada pembacaan Kamar2; jangan menampilkan nol atau mengklaim pengukuran sensor berhasil. Foto rangkaian menunjukkan komunikasi PZEM belum siap dan ujung kabel terbuka. Pengujian USB tidak memerlukan daya AC; perakitan sensor/CT/catu dan beban diselesaikan tim elektro sebelum pengukuran fisik.
