# Meter utama sebelum percabangan dua kamar

Meter utama mengukur jalur bangunan sebelum listrik dibagi ke Kamar1 dan Kamar2. Masing-masing kamar tetap memakai meter sendiri. Ini tiga titik ukur, bukan tiga kamar atau penambahan fasilitas komunal. Posisi fisik, CT, catu dan rangkaian beban disiapkan tim elektro; dokumen ini hanya mencatat integrasi aplikasi.

```text
Sumber listrik -> Pengukuran utama -> Percabangan
                                      |-- Pengukuran Kamar1 -> Beban Kamar1
                                      `-- Pengukuran Kamar2 -> Beban Kamar2
```

## Identitas dan mapping

- ESP32-C3 rev0.4, flash XMC4MB; MAC aktual **10:00:3b:b8:22:98**, port saat persiapan **COM5**.
- UID: `esp32-pzem-10003bb82298`; berbeda dari UID kedua kamar.
- Properti: Kost existing, sama dengan kedua kamar.
- Pemasangan meter: `613e2b28-2eb7-46b2-8569-b5d8ca78a700`, **kind=main**, channel1, `room_id=null` dan `communal_load_id=null`.
- Device, aset PZEM tanpa nomor seri buatan dan pemasangan dibuat melalui API owner dengan CSRF, alasan, audit dan Idempotency-Key persisten. Tidak backdate pemasangan atau membuat sampel awal.
- Katalog/admin existing mendukung jenis Utama. Data meter utama untuk owner; pemeriksaan API Rozan tetap dapat mengakses meter Kamar2 dan ditolak404 pada latest meter utama.

Readiness mapping bukan bukti sensor terbaca. Firmware sudah di-upload/hash verified; Serial membuktikan Wi-Fi dan MQTT tersambung, termasuk setelah restart. Pada tahap USB-only, respons sensor0/25byte dan belum ada pembacaan tersimpan; nilai tidak diganti nol. Katalog API owner terverifikasi memuat1main/2meter kamar/2kamar; katalog Rozan hanya meter Kamar2. Rincian verifikasi portal/Serial ada pada HANDOFF.

## Membuka monitor utama

Di dashboard owner lokal3001, tekan **Perbarui data** atau muat ulang halaman. Bagian **Titik pengukuran** menampilkan pilihan **Meter utama**, **Kamar1**, dan **Kamar2** sesuai katalog API. Meter utama diurutkan pertama, tanpa mengubah pilihan kamar yang sedang dibuka. Pilihan juga tersedia di area utama pada HP walaupun daftar sidebar disembunyikan.

Klik **Meter utama** untuk membuka metrik tegangan/arus/daya/counter, profil daya dan histori konsumsi hariannya melalui API meter utama existing. Jika belum ada sampel, metrik menyatakan tidak tersedia dan grafik kosong; tidak menggunakan angka kamar atau nol pengganti. Tenant tidak memperoleh pilihan utama karena katalog dan endpoint tetap dibatasi backend.

Jika hanya kedua cabang kamar yang dicakup sensor utama, **daya utama mendekati daya Kamar1 + daya Kamar2 pada waktu yang sama**. Selisih dapat berasal dari waktu sampling, ketelitian sensor dan rugi-rugi. Grafik counterkWh mentah tidak harus berimpit karena titik awal/reset meter bisa berbeda; bandingkan **delta konsumsi pada rentang waktu sama**. Jika ada cabang/beban tambahan yang terukur utama, masukkan cakupan itu saat menafsirkan selisih. UI tidak memaksa data agar sama dan tidak menghitung tagihan otomatis dari selisih tersebut. Grafik overlay/jumlah kedua kamar belum ditambahkan pada perubahan navigasi ini.

## Firmware, Wi-Fi dan MQTT

Sketch privat: `.local/expo-pzem-main/PZEM_Main/PZEM_Main.ino`; secret, konfigurasi CLI, backup flash4MB dan build berada pada `.local/expo-pzem-main`, diabaikan Git. Source bersama `firmware/pzem-dashboard` sama dengan kedua kamar: Modbus read-only, RX20/TX21/UART9600, UTC NTP, energi kumulatif integerWh, QoS1 dan antrean NVS8. Pin ini mengikuti firmware existing dan belum membuktikan kabel UART meter utama sesuai.

Portal: **SmartBilling-Setup-Utama**, alamat **http://192.168.4.1**; sandi unik ada di `.local/expo-pzem-main/wifi-portal/setup_password`. Prosedur BOOT/serial dan penyimpanan profil: [PZEM-WIFI-SETUP.md](PZEM-WIFI-SETUP.md). Jangan menyalin sandi setup atau akun MQTT dari kamar lain.

Broker LAN tetap **192.168.1.9:1884**. Akun tambahan dimuat dari file privat `.local/expo-pzem/extra-devices/esp32-pzem-10003bb82298`; setiap perangkat hanya write readings/status UID sendiri. Backend subscribe readings; observer lokal dapat membaca perangkat terdaftar. Auth/ACL diperiksa terisolasi dan di LAN sebelum upload. Tidak membuka port/subnet baru atau anonymous. Broker ini belum menjadi endpoint cloud/TLS.

```powershell
$env:PZEM_VERIFY_REGISTRATION_FILE='.local/expo-pzem-main/registration.json'
node scripts/verify-pzem-dashboard.js --watch
Remove-Item Env:PZEM_VERIFY_REGISTRATION_FILE
```

Verifier membaca data yang benar-benar tersimpan, bukan membuat pembacaan. Exit2 berarti mapping siap tetapi belum ada sampel; respons PZEM invalid atau belum ada NTP tidak menghasilkan nol pengganti.

## Sesudah rangkaian siap

Uji pengukuran dilakukan setelah tim elektro menyiapkan rangkaian. Periksa angka sensor nyata, waktu ukur/diterima, dan meter/channel yang benar di dashboard. Bandingkan **delta konsumsi pada rentang waktu yang sama** antara meter utama dan jumlah dua kamar; jangan menjumlahkan counter kumulatif sebagai konsumsi atau menambahkan total utama ke total kamar. Selisih belum otomatis menjadi biaya komunal atau bukti kesalahan tenant. Gap, reset, perbedaan waktu dan batas pemasangan tetap diperiksa oleh backend.

Tidak ada perubahan rumus/nominal tagihan, finalisasi atau alokasi fairness otomatis pada pendaftaran ini. Meter baru tidak menyediakan data historis sebelum waktu pemasangannya. Deployment Railway dan konfigurasi broker cloud tetap langkah terpisah.
