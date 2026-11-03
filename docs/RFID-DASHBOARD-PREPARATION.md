# Persiapan RFID sebelum pendaftaran kartu

## Tes ESP1000/COM5 dengan kode yang sama — 31 Oktober 2026

Atas permintaan tes konektivitas, MAC10:00:3b:b6:c9:28/COM5 di-flash31Oktober
00:56:36WIB dengan binary kodeyangsama yang sesuai UIDesp32-rfid-10003bb6c928.
Source/pin/dua kartu/countdown tidak diubah. Akun1000yangsempatdibatalkan
diaktifkankembali denganbackup/audit; izinMQTTtopikmiliksendiri tersedia sebagai
akuncomboekstra, tanpa mencabutizin70af. API00:57:09WIB memverifikasi tersambung
danNTPsiap, tetapiRFID/OLED/PZEMbelumterdeteksi saatpemeriksaanUSB. Belumadatap
atau pembacaanPZEM yangdapatdiklaim untuk1000. Pemasanganmeter/reader masih70af;
board70af,datadanfirmwarenya tetapdisimpan. Sebelum tesPZEM1000dicatatdashboard,
pindahkanpemasanganfisikmelaluilifecycleAPI, bukanmembuatduamappingmeterfisik
yangsamasaatbersamaan. Snapshotenergidibatas tapsesi masihbelumditambahkan.
LihatHANDOFFdanpointerprivat `.local/rfid-pzem-reflash/run.json` untukbukti.

## Target terakhir: MAC70af dan meter peraga — 30 Oktober 2026

Pengguna mengoreksi pilihan saat persiapan: target akhir COM8/MAC70:af:09:22:0d:d0,
UID `esp32-rfid-70af09220dd0`. Gunakan MAC, bukan sebutan board baru/lama, supaya
tidak tertukar. ESP sudah di PCB dan USB; MAC diperiksa melalui esptool sebelum
backup. COM5/MAC10:00:3b:b6:c9:28 tidak pernah di-flash dalam pengerjaan ini;
kompilasinya sempat selesai, tetapi pengguna membatalkan target tersebut.
Registrasi yang sempat dibuat dinonaktifkan, reader/pemasangannya diakhiri melalui
API owner, lalu aset yang sama dipindah ke70af dengan histori dan audit tetap ada.
Izin MQTT PZEM hanya diberikan ke70af; akun target yang batal dicabut dari broker.
Permintaan sebelumnya untuk merapikan70af besok sudah digantikan keputusan ini.

Firmware UID+PZEM untuk70af sudah di-upload31Oktober00:02:48.996WIB,
setelah backupfullflash. Statusawal USB: Wi-Fi/MQTT/NTPsiap, tetapi
RFID/OLED/PZEMbelumterdeteksi; belum ada sampelenergi. Pengguna diminta
memasang kembali ESP kePCB saat catu mati lalu startupbaru. Jangan menganggap
badgeRFIDterhubung sudah membuktikan PZEM atau menambah reading pengganti.
Periksa hasil setelah pemasangan pada HANDOFF dan runprivat70af.

Hanya UID91EAA066 dan2A9E2AF2 berada pada DEFAULT_UIDS; serial enrollment nonaktif.
Kartu lain dapat terbaca oleh reader/tercatat untuk diagnosis, tetapi ditolak
jalur akses relay lokal. Keluhan kartu asing mengaktifkan relay pada COM5 berasal
dari firmware yang sudah ada di board itu, bukan binary yang baru dikompilasi;
penyebab pada COM5 belum diperiksa karena target dibatalkan. Verifikasi fisik
penolakan pada70af tetap memerlukan tap kartu asing setelah upload.

Source `firmware/rfid-pzem-v41/` kini menambah7hook pada kiriman v4.1, dengan13pin
tetap sama. Transport UID terpisah dari PZEM channel1 yang menjadwalkan akuisisi
asli pada batas menit UTC. RFID reader channel0 dipetakan ke fasilitas peraga
mesin cuci/kipas. Fasilitas dan meter nyata dibuat melalui API owner yang diaudit.
Pemasangan `main_meter_coverage=outside` mengikuti klarifikasi pengguna bahwa catu
peraga tidak melalui meter utama maupun kedua meter kamar. Monitoring/health
tetap menampilkan sampelnya, sementara perbandingan dan tagihan kost mengecualikan
meter ini. Relay tetap izin lokal v4.1, termasuk countdown5detik setelah tap akhir;
energi sesi pendek tidak dijamin tersedia dari sampel permenit. Tidak membuat
pembacaan nol atau sesi uji sebagai pengganti data fisik. Bukti upload/runtime
terbaru ada pada HANDOFF; bagian berikut merupakan riwayat tahap COM8 sebelumnya.

## Pembaruan 30 Oktober 2026

Atas permintaan pengguna, ESP COM8/MAC70:af:09:22:0d:d0 kini memakai source
`firmware/rfid-pzem-v41/`, berdasarkan kode v4.1 pengguna dengan empat hook dan
modul transport dashboard terpisah. Source/upload/konfigurasi serta batasnya
ada pada `firmware/rfid-pzem-v41/README.md` dan catatan terbaru HANDOFF.
Pin, OLED, buzzer, PZEM dan kendali relay lokal mengikuti v4.1. Ini tahap
pengiriman UID, belum kendali relay yang diotorisasi backend dan belum
telemetri PZEM komunal. Daftar izin lokal dan pendaftaran kartu database terpisah.

Heartbeat sesudah upload22:48:33WIB terverifikasi online/NTPsiap, readerbelum
tersedia/pendingfalse/UIDnull karena pengguna mengonfirmasi boardUSB tanpa
periferal. Dua kartu aktif di aplikasi sudah ada; mappingreader belum ada.
UID fisik baru dapat diuji setelah pemasangan RC522 dan startup yang benar.
Source headless pada bagian historis29Oktober di bawah tetap dipertahankan,
tetapi bukan firmware yang terakhir dipasang pada board ini.

## Catatan persiapan 29 Oktober 2026

Pengguna memilih menyiapkan koneksi ESP RFID ke dashboard terlebih dahulu dan mendaftarkan kartu kemudian. Sketch sumber yang diperiksa adalah `rfid_serial_local.ino` dari pengguna, setelah perpindahan ke PCB baru dengan pin yang menurut pengguna tetap sama. Kesamaan pin belum membuktikan catu dan jalur PCB baru berfungsi.

Konfigurasi aktif laptop diperbarui29Oktober2026 menjadi **suoweng saja**, broker10.163.160.204:1884. Firmware pengganti sudah diunggah dan heartbeat nyata/waktu tersinkron terverifikasi. Profil Wi-Fi kos sebelumnya tidak disertakan pada binary baru. Dukungan dua profil tetap merupakan kemampuan source; konfigurasi aktual saat ini memakai satu profil. Cek ulang IP laptop jika DHCP berubah.

## Perilaku tahap persiapan

- Firmware `firmware/rfid-dashboard/` mempertahankan driver register SPI dari sketch pengguna: SCK4/MISO5/MOSI6/SS7/RST10. Varian ini tidak mengatur GPIO relay, buzzer, tombol, OLED atau PZEM.
- ESP tetap menghubungkan Wi-Fi/MQTT bila RC522 tidak terdeteksi; inisialisasi reader dicoba ulang setiap10detik. Status ESP terhubung tidak berarti reader/kartu berhasil dibaca. Uji reader fisik dilakukan tersendiri.
- Koneksi dan pembacaan terakhir tersedia di **Riwayat fasilitas RFID → Koneksi dan pembacaan kartu**, khusus owner. Tenant tidak mendapat endpoint maupun panel UID.
- Perangkat didaftarkan melalui API owner, dengan kredensial broker unik dan ACL hanya untuk topiknya. Pendaftaran perangkat tidak mendaftarkan kartu atau membuat fasilitas/meter.
- Tap fisik memakai kontrak `rfid/taps` existing dan disimpan sekali pada inbox. Tanpa mapping reader, hasilnya `unknown_reader`; dengan mapping tetapi kartu tidak sah, hasilnya `invalid_card_or_account`. Tidak membuat sesi sah, energi atau tagihan pengganti. Panel tetap dapat menampilkan UID tap terakhir dan apakah kartu terdaftar pada properti owner.
- Mendaftarkan kartu belakangan tidak mengubah tap uji lama menjadi sesi. Angkat kartu dan lakukan tap baru setelah mapping lengkap.

## Status koneksi

Topik baru `smartbilling/v1/devices/<DEVICE_UID>/rfid/status`, QoS1, heartbeat **non-retained** tiap15detik. Payload tepat tujuh field:

```json
{
  "schema_version": 1,
  "boot_id": "d6e0e5c3-d6b7-4162-bca8-d7049c393ae1",
  "connected": true,
  "reader_state": "unavailable",
  "ntp_synced": true,
  "pending_tap": false,
  "uptime_ms": 12000
}
```

Contoh ini ilustrasi, bukan pengukuran. `reader_state`: `ready`, `unavailable`, `error`, atau `unknown` (misalnya LWT). Tidak ada UID kartu, password atau data energi di heartbeat. Backend menolak perangkat tak dikenal/inaktif/simulasi, memvalidasi bentuk payload, dan menyimpan status terakhir di migration026. Waktu penerimaan berasal dari server.

LWT menggunakan topik sama, QoS1, retained=true, `connected=false`. Pesan retained online diabaikan untuk mencegah status lama dianggap koneksi baru. Setelah45detik tanpa heartbeat hidup, panel menampilkan terputus/belum diperbarui. Panel polling5detik. Dashboard Kesehatan Perangkat existing masih memakai usia pembacaan meter; gunakan panel RFID ini untuk koneksi reader.

## Firmware dan ketahanan tap

- Library: core ESP32 existing, MQTT256dpi, ArduinoJson7.4.2. Contoh konfigurasi ada di `firmware/rfid-dashboard/secrets.example.h`; konfigurasi nyata, binary dan cadangan berada di `.local/` ignored.
- Mendukung dua profil Wi-Fi dan host broker masing-masing. Profil jaringan dapat berganti, tetapi IP laptop/broker tetap konfigurasi compile-time: cek ulang saat berpindah ke suoweng atau ketika DHCP berubah. Jangan menjanjikan host selalu sama. MQTT LAN terautentikasi ini belum TLS untuk Internet.
- NTP wajib sebelum tap baru; permintaan dimulai setelah Wi-Fi terhubung, dengan server waktu cadangan Google/Cloudflare dan retry60detik bila clock belum siap. Saat offline/pending/waktu belum siap, tap baru tidak direkam dan perlu diangkat lalu ditap ulang. Tidak membuat tap sintetis ketika reader absen.
- Menggunakan checkpoint satu nilai NVS namespace `sb-rfid-v1`, predecessor lintas boot, pending wire/digest, retry5detik, dan respons backend terkorrelasi seperti varian integrasi existing. PUBACK tidak menghapus pending. NVS/config tidak cocok menghentikan tap tanpa menghapus state; laporan diagnostik tetap berjalan.
- Boot dimulai disarmed. Hanya RF timer timeout tanpa error yang menghitung removal; collision/error tidak mengaktifkan tap. Uji fisik kartu ditahan/removal/noise masih diperlukan.

## Pemeriksaan

```powershell
npm run check
npm test
# Isolated broker, no host port or database; repeats after broker restart.
node scripts/verify-rfid-dashboard-broker-isolated.js
# Setelah migration026, test PostgreSQL ini memakai transaksi rollback.
.\scripts\expo-pzem.ps1 run --rm --no-deps -e INTEGRATION_DB=1 backend node --test test/rfid-status.test.js test/rfid.test.js test/rfid-readiness.test.js
```

Status hardware dan hasil upload aktual dicatat di HANDOFF. Kompilasi/backend test bukan bukti reader PCB baru membaca kartu. Pendaftaran kartu, mapping komunal, pengukuran energi sesi, relay dan billing berada setelah tahap koneksi.
