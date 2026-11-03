# Review rfid_serial_local_revisi.ino — 30 Oktober 2026

Lingkup: membandingkan dua sketch pengguna dan firmware dashboard yang dipasang29Oktober. Pengguna meminta pemeriksaan perbedaan dan kebutuhan perubahan; tidak meminta upload atau penggantian source firmware. Lampiran diperlakukan sebagai source untuk diperiksa.

## Hasil perbandingan

Seluruh13definisi GPIO sama. Delapan fungsi driver RC522 (`readRegister`, `writeRegister`, `initRFID`, `calculateCRC`, `transceive`, `haltCard`, `readCardUID`, `uidToString`) identik setelah tambahan pemanggilan `updateBuzzer()` pada loop CRC/transceive dikecualikan. Revisi tidak mengganti protokol/driver pembaca kartu. Batas removal600ms, SPI1MHz, relay aktif HIGH, dan countdown5detik juga tetap.

| Bagian | Perubahan dari sketch lokal sebelumnya |
|---|---|
| OLED | SSD1306 128×64, alamat0x3C, SDA0/SCL1; animasi Bongo dan status siap/dipakai/ditolak/countdown/selesai. Kegagalan awal OLED tidak menghentikan RFID/relay; ACK diperiksa sebelum pembaruan berikutnya. |
| Buzzer | GPIO2 aktif LOW, dipakai open-drain menurut asumsi Q2/R8 pada komentar. Beep150ms pada tap yang membuka sesi lokal atau meminta OFF; pembaruan buzzer juga dilayani selama menunggu CRC/RF. Kecocokan rangkaian/polaritas belum diuji. |
| Serial | `ENABLE_MANUAL_RELAY_TEST=false`; perintah1/0/H/L/A ditolak default. Jika diaktifkan untuk tes, sesi RFID yang sudah dimiliki tetap dilindungi dari perintah manual. |
| Penolakan | Kartu lain ditolak tanpa mengganti pemilik/countdown. Countdown diprioritaskan pada OLED. |
| Batas penutupan | `shutdownWasPending` mencegah hasil pembacaan yang dimulai saat countdown tetapi selesai setelah OFF otomatis membuka sesi baru. |
| Jaringan/PZEM | Tetap tanpa Wi-Fi/MQTT/NTP/checkpoint persisten; RX20/TX21 PZEM baru dicadangkan. Semua UID boleh membuka sesi kosong. |

## Yang perlu disesuaikan

1. **Pertahankan firmware dashboard sebagai dasar integrasi.** Mengunggah sketch revisi apa adanya menggantikan aplikasi MQTT suoweng yang dipasang kemarin, sehingga tidak ada heartbeat/tap ke dashboard. Ambil modul OLED/buzzer yang berguna ke `firmware/rfid-dashboard`, sambil mempertahankan identitas perangkat, autentikasi broker, kontrak tap, NTP, deduplikasi dan pending/checkpoint NVS. Review ini belum menggabungkan modul tersebut.
2. **Bedakan kartu terbaca dari sesi disetujui.** `handleTap`baris532–543 langsung menyalakan relay/membunyikan beep berdasarkan UID lokal, termasuk kartu belum terdaftar. Untuk integrasi, tampilkan kartu terbaca/menunggu respons dahulu; indikator persetujuan sesi mengikuti hasil backend yang cocok dengan event. Beep identifikasi boleh ada jika maknanya jelas. Kendali relay baru diterapkan setelah makna/fail-safe sesuai kebutuhan tim dipastikan; jangan mengaktifkan relay sebagai efek samping penambahan OLED.
3. **Perbaiki deteksi pengangkatan kartu yang diwarisi dari kode lama.** Baris359 menandai `cardResponded` hanya bila error collision0x08. Kegagalan komunikasi lain dapat masuk jalur kartu dianggap tidak hadir. Jika keadaan ini berlangsung minimal600ms lalu pembacaan pulih, kartu yang tetap ditempel dapat dianggap tap baru dan men-toggle sesi lokal. Hitung removal hanya untuk RF timer timeout yang bersih; error lain harus menahan/disarm tap. Firmware dashboard existing sudah membedakan error dan timeout serta memeriksa register versi saat runtime.
4. **Pertahankan recovery reader dan gate setelah restart.** Revisi menginisialisasi `rfidReady` hanya di setup; kegagalan awal membuat loop tidak mencoba reader lagi sampai reset. `cardLatched=false` saat boot juga menerima kartu yang sudah ditempel sebagai kejadian pertama. Firmware dashboard existing memiliki retry inisialisasi10detik dan gate disarmed saat boot. Status lokal `activeUserUID`/relay hanya di RAM; restart menghapus kepemilikan. Bukan masalah baru pada revisi, tetapi jangan menggantikannya ke jalur integrasi yang persisten.
5. **Sediakan berkas/library OLED sebelum compile.** `bongo.h` tidak ditemukan pada folder `cpstn` yang diperiksa. Repository memiliki kandidat `firmware/rfid-integration/bongo.h` dengan definisi BONGO_WIDTH/HEIGHT/IDLE_FRAMES/TAP_FRAMES dan array yang sesuai nama dalam revisi; ini belum membuktikan header tersebut identik dengan versi yang dimaksud pengirim. Toolchain workspace RFID sebelumnya hanya memiliki MQTT/ArduinoJson pada user-library; SSD1306/GFX/BusIO belum tersedia pada lokasi itu. Tidak memasang dependency atau mengaku sketch sudah lulus compile.
6. **Jelaskan batas countdown terhadap energi sesi.** Revisi tetap mempertahankan relay ON selama5detik setelah tap penutup. Sesi aplikasi existing ditutup oleh event tap yang sah. Jangan otomatis memindahkan waktu akhir backend ke saat relay mati atau memasukkan estimasi energi5detik tanpa keputusan/data ukur yang sesuai. Ini perilaku lokal yang sudah ada, bukan kebijakan billing baru.

## Bukti dan batas

Perbandingan otomatis source: `.local/rfid-revision-review/{compare.mjs,comparison.json}`. Hash lama `36d64bafe277a4108916d8ed670b77c69234638b49c0e878499c1da0b2d36d71`, revisi `fc7573d7bff9aa9aacac282c54fdf1b0a47e9b2f999d3ff8346243084cc7a604`. Perbandingan source dan penalaran jalur error bukan uji radio/hardware. Kedua sketch eksternal, firmware aplikasi, konfigurasi suoweng, dashboard, database dan perangkat tidak diubah pada review ini. Belum compile penuh atau flash revisi.
