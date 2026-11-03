# RFID/PZEM v4.1 dengan pengiriman UID dan PZEM ke SmartBilling

Dasar program adalah `rfid_serial_local_v4.1.ino` kiriman pengguna30Oktober2026.
Salinan utama menambah tujuh titik pemanggilan: empat hook transport UID dan
tiga hook untuk menjadwalkan permintaan PZEM serta menerima hasil/error parser.
Setelah hook tersebut dilepas, source identik dengan kiriman yang
dinormalisasi ke LF. Bitmap Bongo berasal dari ZIP pengguna yang sama.

Pin, driver RC522, UART PZEM, OLED/buzzer, dua kartu bawaan dan alur relay lokal
tetap mengikuti v4.1. Header tambahan mengirim UID dan pembacaan PZEM asli.

## Batas tahap pengujian

- Relay mengikuti izin lokal `DEFAULT_UIDS`, bukan keputusan backend. Pendaftaran
  atau pencabutan kartu di dashboard tidak mengubah daftar izin lokal ESP.
- Tap dikirim sebagai eventv1/QoS1 ke topik perangkat sendiri. Backend tetap
  memvalidasi kartu, hunian, reader, fasilitas dan meter sebelum membuat sesi.
  Tanpa mappingreader, UID dapat ditampilkan owner tetapi sesi ditolak.
- Countdown5detik lokal dan batas tap backend belum direkonsiliasi sebagai kendali
  relay/billing bersama. Hasil historis backend tidak dijadikan perintah GPIO.
- PZEM tetap dibaca setiap detik oleh UART/parser asli v4.1. Pada awal menit UTC,
  `utc_sampling.h` meminta satu pembacaan baru untuk dashboard melalui channel1.
  Permintaan lama diselesaikan dahulu; tidak memberi tanggal baru pada cache.
  Mulai maksimal1detik dan selesai maksimal2detik setelah batas menit; waktu
  akuisisi asli tetap dikirim. Gagal/CRC salah/terlambat tidak diganti nol.
- `pzem_link.h` menyimpan maksimal8 payload offline pada namespace baru
  `sb-v41-pzem-v1`, dengan checksum, identitas perangkat, counter epoch dan waktu
  terakhir. AntreanRAM8 elemen menyerahkan hasil UART ke task jaringan; putus daya
  sebelum commitNVS dapat kehilangan sampel. Antrean penuh dicatat sebagai
  kehilangan, bukan interpolasi. Counter turun menaikkan epoch tanpa reset sensor.
  Retry mempertahankan boot/sequence/waktu/payload; PUBACK belum membuktikan DB.
- Peraga kipas pengguna berada di luar meter utama dan kedua meter kamar.
  Pemasangan `main_meter_coverage=outside` tetap tampil di monitoring/health,
  tetapi dikecualikan dari perbandingan cabang, residual shared, serta tagihan
  fasilitas/tenant pada properti. Bukan tambahan konsumsi meter utama kost.
- Publisher legacy PubSubClient tetap `ENABLE_MQTT=0`. Jalur dashboard baru berada
  pada `dashboard_link.h`, memakai libraryMQTT256dpi dan ArduinoJson7; jangan
  mengaktifkan publisher `kost/komunal` untuk menghubungkan dashboard ini.

## Koneksi, waktu dan retry

`dashboard_link.h` menjalankan MQTT/NVS pada task terpisah agar timeout koneksi
tidak menunggu pada loop kendali lokal. Ini bukan jaminan hard realtime.
Wi-Fi tetap dikelola oleh fungsi asli v4.1 dan tombolGPIO9.

MQTT memerlukan akunperangkat sendiri, hostbrokerLAN dan MAC yang sesuai.
Sebelum tap baru dapat direkam, MQTT harus terhubung dan NTP sudah tersinkron.
Tap saat offline, clock belum siap atau pending belum selesai tidak diantrekan;
angkat dan tap ulang setelah siap. AntreanRAM satu elemen memindahkan pembacaan
ke task jaringan; kehilangan daya sebelum checkpoint tetap dapat kehilangan tap.

Event dan SHA256 wire disimpan sebelum publish pada namespace `sb-rfid-v1`/key
`state`, terpisah dari daftar kartu lokal `rfid`. Retry5detik memakai wire,
bootUUID, sequence, predecessor dan waktu fisik yang sama. PUBACK bukan bukti
sesi diproses. Head dan clearpending disimpan bersama setelah respons terminal
dengan device/boot/sequence/hash cocok; konflik/unconsumed menghentikan transport
tanpa menghapus pending. Mode relay lokal tetap berjalan dan tidak bergantung
pada keberhasilan transport. Jangan menghapus checkpoint untuk memperbaiki stream.
Publikasi pertama ditunda sekitar1detik, tanpa mengubah waktu tap/akuisisi, untuk
menghindari penolakan akibat offset jam positif kecil; bukan toleransi backend baru.

Heartbeat nonretained15detik memakai kontrak diagnostik existing, LWT offline
retained. Owner melihatnya di Riwayat fasilitas RFID → Koneksi dan pembacaan kartu.
Badge Online pada Kesehatan Perangkat mengikuti pembacaan PZEM yang tersimpan,
bukan heartbeat RFID. BoardUSB tanpaRC522 akan melaporkan reader belum tersedia.
Driver v4.1 hanya
inisialisasiRFID saat setup; lakukan startup baru setelah pemasangan fisik oleh
pengguna. Keterbatasan removalRFID dan energi lokal yang diwarisi dirinci pada
`docs/RFID-PZEM-V41-REVIEW.md` dan tidak dianggap sudah diperbaiki oleh transport.

## Build dan konfigurasi

Board ESP32C3 Dev Module, USB CDC On Boot Enabled. Library: MQTT256dpi,
ArduinoJson7, AdafruitSSD1306, AdafruitGFX dan AdafruitBusIO. PZEM dibaca manual,
tidak memerlukan PZEM004Tv30. Source lengkap berada pada folder ini. Buat
`secrets.h` privat dari `secrets.example.h`, gunakan UID/MAC/akun milik board
yang dituju. Kredensial dan binary operasional hanya disimpan di `.local/`.
Status compile/upload/pemeriksaan aktual dicatat pada `docs/HANDOFF.md`.
