# Pengaturan Wi-Fi ESP32 PZEM

Firmware `firmware/pzem-dashboard` menyediakan portal lokal untuk menyimpan sampai empat profil jaringan pribadi 2,4 GHz bersandi (SSID 1–32 byte, password ASCII 8–63 karakter). Setiap ESP32 memiliki nama dan sandi Wi-Fi pengaturan sendiri. Kredensial operasional disimpan pada `secrets.h` privat di `.local/`; contoh source hanya berisi placeholder.

## Membuka pengaturan

1. Saat program ESP32 **sudah berjalan**, tahan tombol **BOOT sekitar tiga detik**, lalu lepaskan. Jangan menahan BOOT saat menyalakan/reset karena itu dapat masuk bootloader upload. Alternatif melalui Serial Monitor 115200: kirim `wifi-setup` dengan newline.
2. Jika Wi-Fi tidak tersambung selama satu menit, portal juga dibuka otomatis satu kali setelah boot. Portal aktif lima menit; percobaan profil tersimpan tetap berjalan. Setelah kedaluwarsa, buka kembali dengan BOOT/perintah serial bila perlu.
3. Hubungkan HP/laptop ke jaringan pengaturan perangkat: **SmartBilling-Setup-Kamar1**, **SmartBilling-Setup-Kamar2**, atau **SmartBilling-Setup-Utama**. Sandi masing-masing ada di `.local/expo-pzem/wifi-portal/setup_password`, `.local/expo-pzem-kamar2/wifi-portal/setup_password`, dan `.local/expo-pzem-main/wifi-portal/setup_password`; jangan memasukkannya ke Git, screenshot, atau log. Nama/sandi ini berbeda dari hotspot tujuan dan kredensial MQTT, serta berbeda antarperangkat.
4. Tetap terhubung walaupun HP menyatakan jaringan tidak memiliki internet. Buka **http://192.168.4.1** secara manual. Portal tidak membutuhkan Railway/internet dan tidak menjamin popup captive portal otomatis.
5. Pilih **Gunakan** pada profil lama, atau isi nama Wi-Fi dan password baru lalu **Uji dan simpan**. Tunggu maksimal 20 detik, kemudian tekan **Perbarui status**. Bila HP terputus ketika kanal AP berubah, sambungkan kembali ke Wi-Fi pengaturan.
6. Profil kandidat disimpan hanya setelah ESP32 mendapat IP pada SSID tersebut. Kegagalan mempertahankan seluruh profil lama dan mencoba jaringan tersimpan kembali. Keberhasilan Wi-Fi **belum membuktikan** internet, MQTT, NTP, pembacaan sensor atau data tersimpan di backend.
7. Tekan **Selesai**, sambungkan HP/laptop kembali ke internet, lalu periksa dashboard dan waktu pembacaan terakhir. Portal juga menutup sendiri setelah lima menit. Saat AP berhenti, respons browser bisa terputus karena jaringan pengaturan memang dimatikan; itu tidak berarti profil yang sudah berhasil disimpan hilang.

Jika HP tujuan menjalankan hotspot tetapi tidak dapat tersambung ke Wi-Fi ESP32 bersamaan, gunakan laptop atau HP kedua untuk membuka portal. Portal mendukung jaringan pribadi bersandi; login web kampus, WPA-Enterprise dan jaringan terbuka belum didukung.

## Profil dan perpindahan

- Profil yang berhasil dipilih ditempatkan pertama. Saat terputus, firmware mencoba profil tersimpan bergantian dengan waktu percobaan 20 detik per profil. Firmware mempertahankan jaringan yang masih tersambung, tanpa memaksa pindah karena profil lain muncul.
- Untuk kembali ke hotspot pribadi, matikan hotspot pengganti dan nyalakan hotspot pribadi yang profilnya masih disimpan; atau buka portal dan pilih **Gunakan**. Perangkat tidak menentukan kualitas sinyal seluler dari keberhasilan Wi-Fi. Jika hotspot tetap aktif tetapi internetnya gagal, pilih jaringan lain lewat portal atau matikan hotspot lama.
- Menambahkan SSID yang sama memperbarui password setelah uji berhasil. Profil penuh tidak menghapus jaringan lama diam-diam. Hapus salah satu profil dahulu; profil aktif dan profil terakhir tidak dapat dihapus.
- Profil disimpan sebagai satu blob berversi/checksum di namespace NVS **wifi-net-v1**, terpisah dari checkpoint pembacaan **pzem-dash-v1**. Restart biasa mempertahankan profil. Data tidak valid menghentikan startup tanpa menghapus konfigurasi/antrean; tidak melakukan factory reset otomatis.
- Portal bersandi dan hanya melayani alamat AP192.168.4.1; tidak membuka form melalui IP Wi-Fi rumah atau dashboard cloud. Mutasi memakai token per sesi serta pemeriksaan Host/Origin, input tervalidasi, HTML escaping, no-store, dan larangan framing. Password profil lama tidak dikirim ke browser atau dicetak ke Serial. Ini pengaturan lokal HTTP melalui AP bersandi, bukan klaim penyimpanan flash terenkripsi.

## Hubungan dengan broker dan dashboard

Pengaturan ini hanya mengganti jaringan Wi-Fi. UID, akun MQTT, pemetaan meter/kamar, counter sensor, histori dan tagihan tetap. Tidak menambahkan endpoint perintah cloud atau menyimpan password Wi-Fi ke backend.

Endpoint sekarang tetap broker **LAN192.168.1.9:1884** dan dashboard lokal3001. Jaringan baru harus dapat menjangkau PC/broker tersebut. Memindahkan ESP32 ke hotspot terpisah tidak otomatis membuat broker rumah dapat diakses melalui internet. Setelah deployment, hostname/port dan TLS broker cloud harus dipersiapkan tersendiri pada firmware.

Dashboard Kesehatan Perangkat existing menghitung keterlambatan dari pembacaan tersimpan, bukan status radio Wi-Fi langsung. Portal ini tidak menambah label cloud yang mengklaim Wi-Fi/MQTT/sensor semuanya sehat. Antrean offline firmware tetap maksimum8 sampel; jangan menjanjikan tidak ada kehilangan saat gangguan panjang.

## Build dan uji

Salin `pzem-dashboard.ino`, `pzem_frame.h`, `wifi_profiles.h` dan `wifi_portal.h` ke folder sketch privat yang sesuai perangkat; pertahankan `secrets.h` dan identitas masing-masing. Tambahkan `WIFI_SETUP_SSID` dan `WIFI_SETUP_PASSWORD` unik minimal12karakter di secret privat sebelum compile. Library WiFi, WebServer dan Preferences disediakan core ESP32 existing; MQTT tetap256dpi2.5.2. Jangan menyalin secret Kamar1 menjadi identitas Kamar2.

```powershell
g++ -std=c++11 -Wall -Wextra -Werror test/wifi-profiles.cpp -o .local/wifi-profiles-test.exe
.local/wifi-profiles-test.exe
```

Uji native memakai fixture jaringan sintetis tanpa koneksi/publish MQTT: penambahan/pergantian/update profil, batas penyimpanan tanpa penggusuran, input invalid, integritas penyimpanan, duplikasi dan perlindungan profil terakhir. Build firmware serta pemeriksaan fisik/HTTP dicatat terpisah pada HANDOFF; keberhasilan compile bukan bukti seluruh uji hardware telah selesai.

Helper `scripts/init-pzem-dashboard.js` menyertakan seluruh header portal dan menghasilkan sandi setup privat. Inisialisasi ulang mempertahankan Wi-Fi pada secret sketch existing, sandi setup dan MQTT; identitas perangkat yang berbeda ditolak. Helper tersebut tetap khusus Kamar1. Regression test terisolasi: `node --test test/init-pzem-dashboard.test.js`; jangan menjalankan init ulang untuk mengganti perangkat lain.

Pemasangan awal 28 Oktober 2026: firmware portal sudah di-upload ke **Kamar1/COM4/MAC10:00:3b:d0:cc:f0**, **Kamar2/COM3/MAC10:00:3b:b7:8f:f4**, dan **Utama/COM5/MAC10:00:3b:b8:22:98**, normal hash verified. Uji AP/HTTP nyata dari PC pada masing-masing perangkat memverifikasi form, token/Origin, input invalid, percobaan jaringan yang tidak tersedia tanpa menyimpan profil, pemilihan profil rumah dan pengembalian Wi-Fi PC. Respons HTTP penutupan Utama terputus saat AP berhenti; Serial kemudian memastikan portal tertutup dan MQTT kembali tersambung, bukti HTTP awal tetap disimpan. Restart ketiga ESP32 menyambung Wi-Fi/MQTT kembali dengan profil tersimpan. Kondisi pembacaan sensor pada pemasangan awal dicatat di HANDOFF; data nyata Kamar2 masuk kemudian setelah jumper dipasang. USB-only tidak menghasilkan pembacaan PZEM baru. Identitas/mapping meter utama ada pada [PZEM-MAIN-METER.md](PZEM-MAIN-METER.md).

## Penambahan hotspot cadangan yang sudah diverifikasi

Pada 28 Oktober 2026, profil hotspot HP pengguna ditambahkan lewat portal existing ke ketiga ESP32. Masing-masing sekarang memiliki dua profil: Wi-Fi rumah dan hotspot HP. Tidak ada compile/upload firmware, penghapusan profil rumah, perubahan akun MQTT, pemetaan meter atau database. Kredensial hotspot hanya disimpan privat/ignored dan di NVS perangkat; tidak dicantumkan dalam panduan ini.

Pengguna memilih metode USB karena tombol BOOT sulit diakses, lalu mengonfirmasi AC dilepas/USB-only untuk setiap ESP32. Portal dibuka melalui perintah serial `wifi-setup`, password dikirim langsung ke form AP lokal, dan daftar profil dibaca ulang sesudah penyimpanan. Ketiga perangkat terverifikasi memiliki dua profil dan kembali memakai jaringan rumah saat diperiksa. Pengguna mematikan hotspot pada tahap akhir; PC juga kembali ke jaringan rumah. Readiness aplikasi3001 HTTP200 dan observer broker LAN berhasil login. Status utama connected=true yang terbaca bersifat retained; ini tidak menggantikan bukti pembacaan PZEM baru.

- Hotspot tujuan harus menyala saat **Uji dan simpan**. Setelah profil tersimpan, hotspot boleh dimatikan; profilnya tetap ada. Hotspot tidak harus menyala selama perangkat menggunakan Wi-Fi rumah yang tersimpan.
- PC pengendali cukup tetap memakai jaringan rumah ketika mulai. Saat mengakses portal, koneksi PC berpindah sementara ke AP pengaturan ESP32, lalu dikembalikan. PC tidak perlu bergabung ke hotspot tujuan untuk menyimpan profil di ESP32.
- Pergantian kanal AP saat ESP32 mencoba jaringan lain bisa memutus respons browser, termasuk setelah POST diterima. Jangan menyimpulkan gagal/berhasil hanya dari respons yang terputus: buka ulang portal lewat serial bila perlu dan periksa daftar profil serta jaringan aktif. Pemindaian WLAN Windows dapat perlu disegarkan jika daftar jaringan belum diperbarui.
- Penambahan ini menguji satu hotspot HP dan jaringan rumah. Pergantian antara dua hotspot HP lain, tombol BOOT secara fisik, timeout lima menit dan power-cut belum diuji fisik. Broker tetap LAN192.168.1.9:1884, sehingga profil hotspot cadangan belum membuktikan pengiriman ke Railway atau broker rumah dari jaringan hotspot.
