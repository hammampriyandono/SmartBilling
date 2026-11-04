# PZEM + relay — source uji tim elektro

## Transport Railway opsional

Default `MQTT_USE_TLS=0` mempertahankan koneksi broker LAN. Pilot cloud memakai
`MQTT_USE_TLS=1`, hostname publik broker, port TLS, akun perangkat unik dan
`MQTT_CA_CERT` berupa PEM CA terpercaya dalam konfigurasi privat. Kedua koneksi
(telemetri dan relay) memakai CA yang sama; tidak ada fallback plaintext atau
setInsecure. Koneksi TLS menunggu NTP. Timeout koneksi2detik/handshake2detik;
jendela jaringan ditutup12detik sebelum sampling menit (LAN tetap4detik).
Sampel terlambat tetap ditandai/dilewati sesuai aturanexisting, tanpa waktu buatan.
Driver GPIO3LOW=ON/open-drain yang sudah teruji tidak berubah karena transport.
Uji shim C++ mencakup kedua transport, CA pada kedua client dan gateclock.
Panduan CA/hostname mengikuti library Espressif NetworkClientSecure; implementasi
diverifikasi terhadap header core ArduinoESP32 3.3.8 yang terpasang.

## Polaritas per instalasi — 4 November 2026

`ROOM_RELAY_ACTIVE_LOW=1` pada secrets.h privat memilih GPIO3 LOW=ON/HIGH=OFF
dan output open-drain sesuai lampiran elektro. Default0 mempertahankan adapter
HIGH=ON yang lama. Heartbeat/ACK membaca GPIO aktual dengan polaritas yang sama.
Binding backend harus memakai `gpio_on_level=0` untuk active LOW, atau1 untuk
active HIGH. Utility `configure-room-relay.js --mode prepare --gpio-on-level 0`
menyiapkan active LOW dalam keadaan nonaktif. Sebelum commissioning/tanpa command,
polaritas dapat diperbaiki melalui prepare; status lama dikosongkan dan perlu
heartbeat baru. Setelah aktif/ada command, perubahan diam-diam ditolak.

Konfirmasi elektrik/kontak memerlukan uji rangkaian tanpa beban bersama tim elektro.
ACKGPIO tidak membuktikan tegangan jalur. Tombol tetap tidak tersedia sebelum
binding diaktifkan dengan verifikasi hardware; jangan menyalin sketch APmandiri
local_dashboard.h sebagai pengganti monitoringMQTT.

Paket 2 November 2026 memakai dasar `.ino`, `relay_control.h` dan `wifi_portal.h` kiriman pengguna. Setelah pengguna menetapkan **GPIO3 HIGH=ON, LOW=OFF**, polaritas diubah menjadi active HIGH, output normal dan status membaca GPIO aktual. Parser Serial/portal, frame PZEM, profil Wi-Fi dan penjadwalan UTC mengikuti dasar existing. Jalur I/O diberi batas waktu seperti dijelaskan di bawah. Tidak menyertakan credential.

- ESP32-C3, UART PZEM RX20/TX21, sampling awal menit UTC.
- Relay GPIO3, active HIGH, awal LOW/OFF. Status menggunakan `digitalRead(3)`, bukan variabel `relayOn`; ini tetap bukan pengukuran kontak atau tegangan jalur kamar. Kondisi sebelum inisialisasi bergantung rangkaian.
- Serial115200: `RELAY ON`, `RELAY OFF`, `RELAY STATUS`. `wifi-setup` dan portal profil Wi-Fi tetap tersedia. Input terlalu panjang dibuang seluruh barisnya.
- `relay_dashboard.h` menambah koneksi kontrol terpisah memakai API native lwmqtt dari library MQTT existing, agar QoS/retain dapat diperiksa. Tiga hook kecil pada sketch tidak mengganti jalur MQTT sensor. Heartbeat GPIO sekitar10detik, perintah maksimal15detik, hanya binding/boot yang cocok, nomor urut meningkat dan retry idempoten. Cache/antrean kontrol berada di RAM; boot baru menolak command boot lama. Tidak memulihkan ON setelah reboot.
- `RELAY_BINDING_ID` pada secret/header privat berasal dari utility prepare owner; kosong/invalid membuat transport kontrol tidak berjalan. Tidak ada reset counter energi, data sensor pengganti atau pemutusan otomatis berdasarkan tenggat.
- Board cadangan memakai identitas/kredensialnya sendiri. Untuk uji dashboard Kamar2, pemasangan dipindah melalui lifecycle API dan binding eksplisit. Firmware ESP Kamar2 asli tetap menjadi cadangan; histori pemasangan lama tidak dihapus. Pemetaan tidak dilakukan otomatis oleh firmware.

Compile/upload aktual memakai sketch privat dengan nama folder/file `.ino` yang sama dan `secrets.h` dari `.local/`. Selalu cocokkan MAC serta backup sebelum menulis hanya partisi aplikasi yang terverifikasi. Jangan memakai binary berkredensial board lain atau erase-all.

Uji `test/relay-cpp/` menjalankan header GPIO, guard UTC/boot/TTL/sequence dan helper I/O aktual dengan stub tanpa hardware. Uji PostgreSQL/MQTT terisolasi serta commissioning nyata dijelaskan pada `docs/ROOM-RELAY-CONTROL.md`. Uji live2November memverifikasi OFF sampai ACK GPIOLOW; tidak mengirim ON atau mengklaim pengukuran kontak. PZEM pada rangkaian uji masih belum membalas UART0/25byte; jalur sensor tetap menampilkan ketiadaan data tersebut.

## Batas penantian I/O

Uji catu rangkaian tanpa USB pada 2 November menghasilkan heartbeat terakhir pukul23:13:51,577WIB. Laporan berhenti sekitar percobaan pembacaan PZEM awal menit23:14; LWT MQTT diterima23:14:24,109WIB sementara backend tetap siap. Pada pengamatan sebelumnya dengan USB, heartbeat berjalan. Ini belum memastikan penyebab listrik atau satu pemanggilan firmware tertentu.

- `pzem_request.h` mengganti `HardwareSerial.flush()` yang menunggu TX idle tanpa deadline pada core ESP32 lokal3.3.8. Adapter memakai `uart_wait_tx_done` dengan batas100ms sebelum/sesudah permintaan8byte. Pembuangan RX lama dibatasi256byte/5ms. Kegagalan menghasilkan diagnosis `tx_timeout`, tanpa membuat pembacaan pengganti. Waktu respons1200ms, CRC, pin dan jadwal sampel tetap sama.
- `diagnostic_serial.h` membuat output debug USB bersifat best-effort: data yang tidak muat dibuang, host yang tidak terpasang dilewati, dan timeout TX perangkat2ms. Nilai RX negatif dinormalisasi menjadi0 agar parser portal tidak berputar pada `available() == -1`. Perintah Serial tetap tersedia jika host terhubung.
- Uji container memeriksa USB tidak terpasang/buffer penuh, RX negatif, batas drain RX, timeout TX sebelum/sesudah kirim dan kegagalan tulis. Hasil stub tidak membuktikan stabilitas board nyata. Sesudah flash perlu pengamatan dengan catu rangkaian tanpa USB melewati sedikitnya dua putaran PZEM. Guard status segar30detik pada dashboard tetap berlaku.
