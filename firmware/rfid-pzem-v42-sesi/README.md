# v4.2 dengan counter pada batas sesi

Transport cloud opsional4November2026: `MQTT_USE_TLS=1` memakai hostname/port
broker, akun perangkat dan PEMCA privat yang benar. Client MQTT menunggu NTP,
memverifikasi CA/hostname, memakai timeout koneksi/handshake terbatas dan tidak
memakai setInsecure/plaintextfallback. Default0 mempertahankan LAN. Source utama
kartu/relay/countdown dan pzem_link.h tetap identik dengan versi yang telah diuji;
dashboard_link.h hanya mengganti tipe client, mengatur TLS dan gateclock koneksi.
Header transport mandiri sama dengan sketch meter dan relay, diverifikasi test.
Sebelum cutover, periksa sesi aktif/tap pending pada kedua backend. Sesudahnya,
uji reader dan tap awal/akhir asli; statusonline saat USB tidak membuktikan reader
sudah terpasang atau sesi kartu berhasil. Kedua profil Wi-Fi tetap dipertahankan.

Kandidat ini melengkapi pengiriman counter sesi dari integrasi v4.2. Source
v4.2 sebelumnya tetap tersimpan pada folder firmware/rfid-pzem-v42. Pin,
GPIO relay, dua kartu91EAA066/2A9E2AF2, penolakan kartu asing, autoarah UART,
OLED, dan countdown5detik dipertahankan. Backend, schema MQTT dan database
tidak dilonggarkan atau diganti.

Sebelum menerima transisi sesi yang sah, loop menyelesaikan permintaan UART
yang sedang berjalan, lalu meminta frame PZEM baru. Frame harus lulus parser
CRC dan pemeriksaan nilai. Selama menunggu, buzzer/countdown tetap dilayani
dan task jaringan tetap berjalan. Masing-masing tunggu dibatasi sekitar270ms.
Data cache dari poll sebelumnya tidak dipakai sebagai pembacaan batas.

Waktu penerimaan transisi sesi di firmware adalah waktu akuisisi frame baru
tersebut, sebelum keputusan relay lokal dijalankan. Nilai UTC aktual yang sama
dipakai pada reading.measured_at dan tap.occurred_at. Ini bukan pemberian tanggal
tap pada cache lama, pembulatan ke awal menit, atau timestamp yang dibuat server.
Pembacaan rutin pada awal menit tetap berjalan. Setelah payload tap dan reading
masuk, worker backend yang sudah ada dapat mencocokkan kedua batas dan menghitung
selisih counter, dengan penjagaan gap, epoch dan validitas yang tetap berlaku.

Tap yang ditolak/diabaikan secara lokal dari kartu yang dikenal tidak boleh
men-toggle sesi backend. Kartu asing tetap masuk jalur deny lokal dan dikirim
untuk diagnosis/penolakan backend, tanpa mengambil counter batas atau menyalakan
relay. Kartu pemilik yang di-tap lagi saat countdown tidak membuat sesi baru.

Jika waktu/MQTT belum siap, antrean penuh, atau PZEM tidak memberi frame baru,
perhitungan tidak memakai angka pengganti. Kontrol relay lokal tetap mengikuti
aturanv4.2; sesi dapat tetap unavailable bila pembacaan batasnya hilang. Pending
tap masih mengikuti batas transport sebelumnya: satu pending, tap baru saat
offline/busy dapat tidak direkam. Antrean RAM sebelum commit NVS mempunyai
jendela kehilangan saat daya putus. Dua outbox bukan satu transaksi lintas
namespace; kehilangan salah satu bukti menghasilkan energi unavailable.
Layout dan namespace NVS yang sudah dipakai tidak dihapus atau diganti.

## Dua jaringan Wi-Fi

`WIFI_SSID`/`WIFI_PASSWORD` tetap jaringan pertama. Opsional
`WIFI_FALLBACK_SSID`/`WIFI_FALLBACK_PASSWORD` pada secrets.h privat menambahkan
jaringan kedua. Saat belum tersambung, percobaan bergantian mengikuti interval
ulang existing 20 detik; koneksi yang masih tersambung dipertahankan. Tombol
existing menyambung ulang profil yang sedang dipilih. Tanpa fallback, perilaku
satu jaringan tetap. Kedua jaringan harus tersedia pada 2,4 GHz dan menyediakan
akses ke broker yang sama. Ini konfigurasi firmware, bukan portal profil PZEM.
Alamat broker LAN perlu disesuaikan jika IP laptop berubah.

Pemilihan jaringan tidak mengubah otorisasi kartu, pin/relay, countdown, pembacaan
batas sesi, payload MQTT atau penyimpanan NVS. Uji sambungan dan tap fisik tetap
diperlukan setelah pemasangan; hasilnya dicatat di HANDOFF.

Counter dikirim dari Wh integer sebagai kWh dengan tiga desimal. Karena itu
selisih sesi pendek pada kipas kecil dapat0kWh walau ada daya: counter belum
bertambah1Wh. Nol hanya sah bila kedua batas valid dan counternya memang sama;
missing_boundary tetap tidak tersedia. Counter kumulatif tidak dijumlahkan.

Definisi sesi tetap tap masuk sampai tap keluar. Countdown5detik setelah tap
keluar adalah perilaku relay lama; tambahan ini tidak memasukkan tail itu ke
batas sesi. Riwayat sesi lama tanpa pembacaan batas tidak ditambal atau direka.
Peraga di luar meter utama tetap dikecualikan dari tagihan dan residual kost.

Pengujian kandidat mencakup sebelas kasus otorisasi, sepuluh kasus akuisisi
dalam shim alur source, payload dari format printf firmware terhadap parser
backend, serta42tes pada PostgreSQL sementara. Shim bukan uji hardware.
Status compile, backup, pemasangan dan uji fisik dicatat pada docs/HANDOFF.md;
pointer privat .local/rfid-pzem-sesi/run.json. Kredensial hanya di secrets.h privat.
