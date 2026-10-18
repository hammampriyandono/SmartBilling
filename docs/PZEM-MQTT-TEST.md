# Uji koneksi ESP32-C3 / PZEM ke MQTT lokal

Untuk kelanjutan ke database/dashboard Kamar 1, lihat [PZEM-DASHBOARD-TEST.md](PZEM-DASHBOARD-TEST.md). Broker diagnostik pada dokumen ini tetap terpisah dan tidak menulis histori aplikasi.

Disiapkan 15 Oktober 2026 atas permintaan pengguna untuk mendiagnosis `PubSubClient rc=-2`. IP Wi-Fi PC yang diperiksa: **192.168.1.8/24**. Ini pengujian transport dan sensor dengan sketch pengguna, bukan ingest produksi atau pengamatan tujuh hari.

## Broker terpisah

`compose.pzem-test.yaml` menjalankan project `smartbilling-pzem-test`, memakai image Mosquitto yang sama dengan stack existing. Broker hanya dipublikasikan pada IPv4 Wi-Fi yang dinyatakan eksplisit. Stack ini tidak memiliki database, backend, bridge, atau volume aplikasi. Pesan tidak disimpan sebagai histori dan tidak diteruskan ke dashboard.

- Device `pzem-kamar2`: hanya **write** ke `smartbilling/test/pzem/kamar2` dan `smartbilling/test/pzem/kamar2/status`.
- Observer `pzem-observer`: hanya **read** kedua topik tersebut.
- Anonymous ditolak. Password acak berbeda disimpan di `.local/pzem-test/` dan hanya dibaca melalui secret file. Password broker aplikasi tidak dipakai atau dirotasi.
- MQTT TCP 1883 belum TLS; khusus LAN pengujian. Tidak untuk deployment Railway/Internet. Jangan membuat port forwarding router.
- Firewall helper menambahkan rule inbound khusus TCP 1883, local address 192.168.1.8, interface Wi-Fi, remote subnet 192.168.1.0/24. Tidak mematikan firewall atau mengubah profil jaringan Public. Rule ini tidak membatalkan rule lebih luas yang mungkin sudah dibuat aplikasi lain.

## Menjalankan kembali

Konfigurasi dan sketch lokal pertama kali dibuat dari sketch yang diberikan pengguna:

```powershell
node scripts/init-pzem-test.js '<path-sketch-lokal.ino-atau-txt>' 192.168.1.8
```

Initializer hanya menerima format sketch diagnostik pengguna. Wi-Fi SSID/password diambil tanpa dicetak, lalu dipindahkan ke `secrets.h` lokal. Secret MQTT existing dipertahankan. `.local/` dan `**/secrets.h` diabaikan Git. Tidak menyalin kredensial ke berkas contoh atau source terlacak.

```powershell
.\scripts\docker.ps1 compose --env-file .local/pzem-test/compose.env -f compose.pzem-test.yaml up -d --wait --wait-timeout 60
node scripts/verify-pzem-test.js
```

Perintah verifier menggunakan IP LAN, MQTT 3.1.1 untuk round trip, dan MQTT 5 untuk bukti PUBACK ACL ditolak. Yang diuji: publish status diagnostik beridentitas acak, login valid, anonymous/password salah ditolak, device tidak bisa membaca atau menulis topik kamar/produksi lain, observer tidak bisa menulis. Tidak membuat contoh angka sensor. Healthcheck container hanya memeriksa proses; verifier membuktikan protokol/autentikasi.

Jika firewall belum tersedia, jalankan satu kali di **PowerShell Administrator**:

```powershell
Set-Location C:\Users\Admin\source\repos\SmartBilling
.\scripts\enable-pzem-test-firewall.ps1
```

Helper menolak reuse rule existing yang berbeda. Bila IP Wi-Fi berubah, periksa IP, scope firewall, compose.env dan MQTT_HOST sebelum meneruskan. Jangan mengubah bind menjadi 0.0.0.0.

## Upload lewat Arduino IDE

1. Buka `.local/pzem-test/ESP32_PZEM_MQTT_Test/ESP32_PZEM_MQTT_Test.ino`. `secrets.h` harus tetap di folder yang sama; jangan dibagikan.
2. Board **ESP32C3 Dev Module**, **USB CDC On Boot = Enabled**, pilih port board saat ini.
3. Tutup Serial Monitor/Plotter sebelum upload. Upload, buka monitor **115200 baud**, lalu tekan RESET tanpa menahan BOOT.
4. Hasil yang dicari: Wi-Fi connected → `Connecting MQTT...connected` → `Data PZEM: ...` atau diagnosis sensor tidak terbaca.

Sketch mempertahankan pembacaan PZEM pengguna di UART1 RX20/TX21, sampling/publish lima detik dan nilai energi kumulatif. GPIO20/21 dipakai UART1; Serial debugging menggunakan USB CDC C3. Wiring, tegangan antarmuka, CRC/sensor dan akurasi fisik belum divalidasi oleh kompilasi.

Sketch masih menunggu Wi-Fi/MQTT sebelum membaca sensor; ini diagnostik awal. Library PubSubClient publish QoS0 dan payload tanpa timestamp/identitas belum memenuhi `ESP32-MQTT-CONTRACT.md` (QoS1 dan schema v1 lengkap). Jangan memasukkannya sebagai data produksi atau menjanjikan offline queue/deduplikasi.

Observer opsional menunggu data perangkat 30 detik dan menulis hasil hitungan lokal tanpa mencetak credential/payload:

```powershell
node scripts/verify-pzem-test.js --watch
```

### Memantau nilai PZEM dari PowerShell tanpa USB

ESP32 yang ditenagai catu daya dapat dipantau lewat pesan MQTT selama Wi-Fi/broker tersedia. Jalankan pemantau terus-menerus:

```powershell
Set-Location C:\Users\Admin\source\repos\SmartBilling
node scripts/monitor-pzem-test.js
# Ctrl+C untuk berhenti. Opsi pemeriksaan terbatas: --seconds 15
```

Pemantau hanya subscribe sebagai `pzem-observer`, membaca password dari file lokal tanpa mencetak/menaruhnya di argumen command. Output menampilkan topik, status heartbeat `mqtt_connected`, dan enam nilai numerik PZEM asli. Waktu label adalah **waktu diterima PC dalam WIB**, bukan timestamp pengukuran sensor. Tidak menulis database atau membuat angka sensor. Data terputus tidak diganti nol. Pesan status bukan bukti sensor sehat; bila status ada tetapi data tidak ada, perlu diagnosis pembacaan sensor.

Perintah lama `mosquitto_sub -h 127.0.0.1 ...` tidak cocok dengan bind broker tes sekarang: endpoint berada pada `192.168.1.8:1883` dan mewajibkan autentikasi observer. Aplikasi client Mosquitto tetap bisa dipakai dengan broker Docker, tetapi pemantau Node ini sudah memakai dependency proyek sehingga tidak memerlukan instalasi client tambahan.

Pemantau ini menampilkan pesan MQTT yang dikirim firmware. `Serial.println` lainnya (misalnya diagnosis pembacaan PZEM gagal) tidak otomatis menjadi pesan MQTT. Diagnostik firmware jarak jauh memerlukan topik/status tambahan bila nantinya dibutuhkan.

Round trip dari PC ke IP LAN tidak membuktikan koneksi dari ESP32 atau bahwa AP mengizinkan komunikasi antarklien. Bukti perangkat memerlukan status dan pesan aktual sesudah sketch di-upload.

## Berhenti setelah tes

```powershell
.\scripts\docker.ps1 compose --env-file .local/pzem-test/compose.env -f compose.pzem-test.yaml stop
# Opsional, PowerShell Administrator: tutup kembali akses firewall tes.
Disable-NetFirewallRule -Name SmartBilling-PZEM-Test-MQTT
```

Tidak perlu down -v, menghapus volume, reset database, atau menghentikan stack utama/RFID.

## Hasil verifikasi 15 Oktober 2026

- Docker broker tes berjalan healthy, port publik host hanya `192.168.1.8:1883`; autentikasi/round trip/ACL lulus sebelum dan sesudah restart broker tes.
- Rule firewall berhasil dibuat melalui elevasi UAC Windows dan filter address/protocol/interface diperiksa. Menjalankan helper ulang mengenali rule yang sama.
- Arduino CLI 1.5.1, core ESP32 3.3.12, PubSubClient 2.8: kompilasi `esp32:esp32:esp32c3:CDCOnBoot=cdc` lulus. Program 981.483 byte (74%), global RAM 37.808 byte (11%). Tidak upload/flash atau membuka COM4.
- Pemeriksaan sintaks JavaScript dan PowerShell lulus. Layanan utama backend, PostgreSQL, Mosquitto tetap healthy dan konfigurasi/port aplikasi utama tidak diubah.
- Belum terbukti: ESP32 login ke broker baru, publish sensor, wiring/validitas PZEM, cakupan jaringan dari perangkat lain, ingest database produksi, atau pengamatan tujuh hari. Langkah berikutnya upload sketch lokal dan periksa Serial Monitor.
