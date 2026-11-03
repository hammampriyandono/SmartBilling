# RFID/PZEM v4.2 untuk SmartBilling

Dasar program adalah kiriman pengguna rfid_serial_local_v4.2.ino, identik dengan
sketch dalam ZIP v4.2. File asli OneDrive tidak diubah. Tujuh hook menambahkan
jalur dashboard yang sama dengan integrasi v4.1. Setelah hook dilepas, source
kembali tepat ke kiriman v4.2 yang dinormalisasi ke LF. Bongo berasal dari ZIP.

Perubahan v4.2 terutama pada UART PZEM. GPIO20/21 tetap digunakan; sebelum pernah
berhasil membaca dalam satu boot, empat kegagalan memicu pertukaran arah RX/TX.
Arah yang berhasil disimpan pada key pzswap di namespace lokal rfid. Setelah
pernah berhasil dalam boot itu, kegagalan berikutnya tidak mengganti arah otomatis.
U meminta poll200ms selama15detik, T menukar arah, dan D mengaktifkan log byte.
Proses upload/verifikasi tidak menjalankan ketiga perintah tersebut. LED sendiri
tidak membuktikan respons yang valid atau menetapkan penyebab kegagalan.

Hanya UID91EAA066 dan2A9E2AF2 yang diizinkan. ALLOW_SERIAL_ENROLL=false dan
ENABLE_MANUAL_RELAY_TEST=false. Kartu asing memanggil deny/beep/OLED DENIED;
kartu lain tidak menutup sesi pemilik. GPIO0–10 dan countdown5detik tetap sama.
Hook UID juga merekam kartu asing untuk diagnosis, tanpa memberi izin GPIO.
Pendaftaran/revokasi dashboard belum menyinkronkan daftar izin lokal secara dinamis.

dashboard_link.h, pzem_link.h dan utc_sampling.h identik dengan integrasi v4.1.
Polling lokal tetap setiap1detik, sedangkan satu akuisisi baru dikirim pada awal
menit UTC melalui channel1/QoS1 dengan timestamp asli, akun/MAC sendiri, antrean
NVS persisten dan epoch counter. Heartbeat RFID tetap15detik; reader channel0.
Publisher legacy kost/komunal tetap nonaktif. Library: MQTT256dpi, ArduinoJson7,
AdafruitSSD1306/GFX/BusIO. BoardESP32C3, USB CDC On Boot Enabled; kredensial
privat pada secrets.h berdasarkan secrets.example.h.

Versi ini belum menambah snapshot counter tepat pada batas tap. Energi Wh lokal
memakai cache PZEM dari source pengguna; backend tetap mensyaratkan pembacaan
pada batas awal/akhir untuk energi sesi. Sesi dapat selesai tetapi energinya
unavailable/missing_boundary. Tidak mengisi nol atau memakai sampel menit terdekat
sebagai energi sesi final. Meter peraga tetap berada di luar cakupan meter utama.

Audit source dan sebelas fixture alur otorisasi dalam shim lulus. Shim bukan uji
fisik RFID/relay. Hasil kompilasi, backup, flash dan pemeriksaan aktual dicatat di
docs/HANDOFF.md; bukti privat ditunjuk .local/rfid-pzem-v42/run.json.
