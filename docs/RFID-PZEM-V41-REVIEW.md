# Review Node RFID PZEM v4.1 — 30 Oktober 2026

Lingkup: memeriksa isi ZIP dan source lepas kiriman pengguna, bukan memasang firmware. Source dan instruksi lampiran diperlakukan sebagai bahan pemeriksaan. Tidak membuka port perangkat, mengubah firmware/perangkat, jaringan, broker atau database.

## Isi dan kesamaan paket

ZIP `C:/Users/iswan/OneDrive/Documents/AKuliah/cpstn/Node_RFID_PZEM_v4.1.zip` berisi folder `rfid_serial_local/` dengan empat berkas:

| Berkas | Fungsi |
|---|---|
| `rfid_serial_local.ino` | RFID, relay, buzzer, OLED, daftar kartu lokal, PZEM dan Wi-Fi; MQTT opsional |
| `bongo.h` | Bitmap animasi OLED, sudah disertakan dan diwajibkan oleh include sketch |
| `BACA_DULU.md` | Penjelasan fitur, konfigurasi dan petunjuk pengujian dari pengirim |
| `secrets_contoh.h` | Contoh konfigurasi Wi-Fi dan host/port MQTT |

File `.ino` dalam ZIP identik byte demi byte dengan `C:/Users/iswan/OneDrive/Documents/AKuliah/cpstn/rfid_serial_local_v4.1.ino`. SHA256 source: `120d9d80582105f79a544601e7806b1bd349681a15d4b4249007ea6525315972`. Tidak ada `secrets.h` operasional dalam ZIP. Jika memakai file lepas, `bongo.h` tetap harus berada di folder sketch. Nama folder/file dalam ZIP sudah sama-sama `rfid_serial_local`.

## Perilaku yang terverifikasi dari source

- Semua13konstanta GPIO sama dengan `rfid_serial_local_revisi.ino`: OLED0/1, buzzer2, relay3, SPI4/5/6/7, LED8, tombol9, RST10, PZEM20/21. Kesamaan konstanta bukan validasi jalur PCB/catu fisik.
- Driver RFID tetap manual SPI1MHz. UID dicetak pada Serial115200; kartu pemilik menutup sesi melalui countdown5detik, kartu lain ditolak tanpa mengganti pemilik. Kontrol relay manual tetap nonaktif. OLED/Bongo dan buzzer150ms dipertahankan; penolakan menambah beep700ms.
- PZEM kini benar-benar dibaca melalui UART19600baud, RX20/TX21, Modbus fungsi04/alamatF8. Permintaan setiap1detik, timeout250ms, panjang balasan25byte dan CRC diperiksa. Decoder membaca V/A/W/Wh/Hz/PF. Serial mencetak ringkasan sekitar10detik; perintah `P` menampilkan nilai terakhir. OLED menampilkan daya atau `PZEM?`.
- Dua UID fisik yang dibaca pada pengujian sebelumnya sudah dimasukkan pengirim ke `DEFAULT_UIDS`. Nilai tidak disalin ke dokumen ini. `ALLOW_SERIAL_ENROLL=false`: dua kartu bawaan boleh membuka sesi; pendaftaran/penghapusan E/X ditolak. Daftar tambahan pada namespace `rfid`/key `uids` dibersihkan saat boot bila sebelumnya ada. Ini tidak menghapus kartu pada PostgreSQL atau namespace Wi-Fi/PZEM lainnya.
- Energi sesi lokal dihitung dari selisih integerWh awal/akhir bila kedua ujung dianggap valid dan counter akhir tidak lebih kecil. Durasi, UID dan Wh dicetak setelah countdown, kemudian relay diminta OFF. Sesi aktif dan batas energinya hanya di RAM.
- Wi-Fi opsional memakai `secrets.h`; tanpa file itu SSID kosong dan operasi lokal tetap berjalan. TombolGPIO9/perintah `W` mencoba sambung ulang Wi-Fi; retry otomatis20detik. `K` menampilkan kartu dan `?` status. Ini bukan portal HTTP/AP seperti paket A05_NodeKomunal_v4 sebelumnya.
- `ENABLE_MQTT=0` secara default. Jika dinyalakan, menggunakan PubSubClient, topik `kost/komunal/mesincuci01/{pzem,session,event,status}`; telemetri5detik. Koneksi MQTT di source tidak mengirim username/password. Bukan kontrak MQTT dashboard SmartBilling existing.

## Batas integrasi dan temuan

1. **Pendaftaran dashboard dan izin lokal terpisah.** `isRegistered()` baris559–561 memeriksa kartu bawaan/daftar ESP. Backend tidak diminta memberi izin relay. Mencabut kartu di dashboard tidak mencabut UID bawaan firmware. Menambahkan kartu di dashboard tidak memasukkannya ke daftar lokal. Source juga tidak memublikasikan setiap tap sebagai eventv1; jangan menyatakan panel UID/sesi aplikasi otomatis terhubung.
2. **MQTT perlu penyesuaian kontrak dan akun.** Topik `kost/komunal/...`, field `v/i/p/e_wh`, ringkasan `durasi_s/energi_wh`, dan status teks online/offline berbeda dengan subscriber existing. Tidak ada bootUUID, sequence, predecessor, timestampNTP, counter_epoch atau antrean persisten untuk pesan ini. PubSubClient hanya memublikasikan QoS0; QoS1 pada argumen will bukan QoS1 untuk telemetri. Broker aplikasi memerlukan akun perangkat dengan ACL sendiri. Mengubah IP/port atau mengaktifkan flag saja tidak cukup.
3. **Batas energi belum siap menjadi acuan billing backend.** Baris1025–1026 dan1049–1050 memakai pembacaan terakhir, tanpa pembacaan baru yang dikorelasikan ke batas tap. Flagvalid baru dibersihkan setelah tiga kegagalan beruntun. Reset counter di tengah sesi hanya dideteksi jika nilai akhirnya masih lebih kecil; jika counter pulih melewati baseline, reset dapat terlewat. Tidak ada counter_epoch sesi atau checkpoint aktif. Perhitungan biaya SmartBilling tetap di backend; tidak mengimpor selisih ini sebagai data terverifikasi tanpa kontrak/bukti yang sesuai.
4. **Masalah deteksi removal lama masih ada.** Baris498 hanya menganggap collision sebagai respons ketika WUPA gagal. Error lain bisa dianggap kartu tidak hadir dan setelah600ms dapat melepas latch; pemulihan pembacaan kartu yang tetap ditempel berisiko memicu tap tambahan. Reader juga hanya diinisialisasi pada setup dan belum retry bila gagal. Ini keterbatasan yang diwarisi, bukan bukti bahwa hardware yang sedang dipakai gagal.
5. **Petunjuk level UART perlu diperiksa.** `pzemPrintHint()` baris672–673 dan README menyarankan resistor seri tunggal pada jalur sinyal5V keGPIO. Saran tersebut belum membuktikan tegangan input aman. Batas input digital pada datasheet ESP32-C3 adalah VDD+0,3V (sekitar3,6V pada domain3,3V); resistor seri tunggal bukan jaminan penurunan level ke3,3V. Tim elektro perlu memvalidasi level antarmuka dan rangkaian penyesuaian level aktual. Tidak mengikuti instruksi mengubah suplai, menukar kabel, atau menyambungkan AC dari lampiran.
6. **Blocking MQTT dapat memengaruhi countdown.** Bila flagMQTT diaktifkan, reconnect/publish sinkron berlangsung di loop utama. `finishSession()` juga melakukan publish sebelum `setRelay(false)`, sehingga waktu OFF tidak boleh dianggap tepat5detik tanpa pengujian. DefaultMQTT0 tidak menjalankan bagian tersebut.

Referensi primer: [PubSubClient — limitations](https://github.com/knolleary/pubsubclient#limitations), [datasheet ESP32-C3 bagian5.4](https://www.espressif.com/sites/default/files/documentation/esp32-c3_datasheet_en.pdf).

## Pemeriksaan dan batas kesimpulan

Pemeriksaan hash ZIP/file lepas dan seluruh13GPIO lulus. Helper privat `.local/rfid-v41-review/check.mjs` memeriksa konstanta dan menjalankan empat fixture sintetis hanya terhadap parser JavaScript existing, tanpa MQTT/database/serial. Hasil tersimpan di `check.json`: QoS0 ditolak `invalid_qos`, menggantiQoS saja masih `invalid_topic`, menggantiQoS+topik masih `unknown_field`, dan ringkasan sesi bukan eventtapv1 (`invalid_fields`). Fixture tidak mewakili data sensor nyata dan tidak pernah dipublikasikan.

Belum compile Arduino, memasang dependency, flash, atau menguji PZEM/relay/catu fisik v4.1. Kemampuan membaca sensor disimpulkan dari keberadaan kode, bukan bukti hardware sudah terbaca. Untuk mode default, library eksternal SSD1306/GFX beserta dependensinya diperlukan; PZEM dibaca manual tanpa PZEM004Tv30. PubSubClient hanya diperlukan jika flagMQTT diaktifkan. Firmware RFID lokal yang sebelumnya diuji tetap tidak diubah oleh review ini.
