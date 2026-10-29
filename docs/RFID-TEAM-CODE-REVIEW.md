# Review paket RFID tim — 29 Oktober 2026

Tindak lanjut perangkat USB dan percobaan pendaftaran kartu dicatat terpisah di [RFID-USB-CARD-REGISTRATION.md](RFID-USB-CARD-REGISTRATION.md). Batas "tidak flash/perangkat" di bawah berlaku untuk tahap review source ini, sebelum pekerjaan USB tersebut.

Lingkup: pembacaan kedua sketch `node_komunal_rfid*.ino`, README, seluruh source server dalam `RFID_Node_Komunal_A05.zip`, serta source desain/net pad PCB v1.1 di `D:/Hammam/aKuliah/Capstone/rfid/`. Instruksi pemasangan dalam paket diperlakukan sebagai bahan tinjauan. Tidak menjalankan installer, batch server, broker, perintah pabrik PCB, atau upload firmware.

## Identitas paket

- `PCB_Node_RFID_A05_v1.1.zip` dan folder hasil ekstraksi identik: **39 berkas dibandingkan berdasarkan isi byte, 0 perbedaan**.
- `node_komunal_rfid (1).ino` identik dengan sketch di ZIP node. Versi tanpa `(1)` hanya menambah/memperjelas komentar relay PCB v1.1; definisi dan logika program sama.
- README di ZIP node identik dengan README lepas.
- ZIP node melengkapi paket dengan `bongo.h`, `secrets.h`, server Python, requirements, konfigurasi Mosquitto, dan batch startup. `secrets.h` hanya diinventarisasi sebagai nama berkas; isinya tidak dibaca, diekstrak, dicetak atau disalin ke repository.

## Kesimpulan integrasi

Paket ini merupakan prototipe mandiri: ESP32 → topik `kost/communal/...` → Python → SQLite. SmartBilling memakai topik `smartbilling/v1/devices/.../rfid/taps`, inbox event, sesi backend Node/Express dan PostgreSQL. Mengganti alamat broker saja tidak menghubungkan paket ini ke dashboard.

Bagian hardware/UI yang dapat menjadi referensi: MFRC522, pembacaan UID 4/7/10 byte, OLED, buzzer dan pin yang sesuai PCB. Protokol, state sesi, persistensi event dan tanggapan perlu diselaraskan dengan [integrasi RFID existing](RFID-HARDWARE-INTEGRATION.md). Ini arahan tindak lanjut, belum perubahan kode atau keputusan baru tentang relay.

## Temuan prioritas

### 1. P1 — Permintaan autentikasi ulang membuat sesi baru dan membatalkan sesi aktif

Lokasi ZIP: `server_lokal/rfid_server.py:106–151`, khususnya 123–143.

`req_id` hanya dikembalikan ke perangkat; server tidak menyimpan identitas request untuk deduplikasi. Setiap request valid membatalkan seluruh sesi ACTIVE perangkat sebagai STALE, lalu membuat sesi baru. Pemeriksaan busy hanya ada pada firmware.

**Reproduksi source aktual / SQLite di memori:** request `req_id=123` yang sama dua kali menghasilkan sesi 1 ABORTED/STALE dan sesi 2 ACTIVE. Request kartu terdaftar lain saat fasilitas aktif juga membatalkan sesi lama. Artinya retransmisi/klien lain dapat mengubah histori tanpa tap penutup dari pengguna awal.

Perbaikan yang diperlukan: identitas event persisten, hasil replay yang sama, dan pemeriksaan fasilitas sibuk di backend. Jangan otomatis membatalkan sesi existing untuk menerima request baru.

### 2. P1 — Balasan OK duplikat dapat menutup sesi server saat relay tetap ON

Lokasi sketch tanpa `(1)`: `processAuthReply()`, baris 547–557; relay ON pada 569–571. Pada sketch ZIP, nomor baris empat lebih kecil.

Setelah OK pertama diproses, state menjadi IN_USE. Jika balasan OK identik diterima lagi, kondisi `state != WAIT_AUTH` menganggapnya balasan terlambat lalu memublikasikan `session/end` dengan AUTH_TIMEOUT. State lokal dan relay tetap IN_USE/ON. Server memublikasikan respons dengan QoS1; duplikasi harus dapat ditangani.

Temuan berdasarkan jalur kontrol source, belum reproduksi pada board. Balasan request yang sudah diselesaikan perlu dikenali dan diabaikan secara idempoten; jangan mengakhiri sesi hanya karena respons ulang tiba.

### 3. P1 — Waktu akhir offline mengikuti waktu pesan tiba, bukan kejadian

Lokasi ZIP: `server_lokal/rfid_server.py:154–180`, terutama 171–176. Firmware mengirim `duration_s`, tetapi server mengabaikannya dan memakai `now_str()` ketika menerima pesan akhir.

**Reproduksi source aktual / SQLite di memori:** sesi mulai 10.00, perangkat melaporkan durasi 60 detik, pesan akhir tiba 10.10 → database menyimpan 600 detik dan akhir 10.10. Klaim README bahwa durasi tetap akurat ketika offline tidak berlaku pada jalur ini.

Untuk SmartBilling, simpan timestamp kejadian asli yang sah dan waktu diterima secara terpisah. Energi dihitung dari pembacaan meter yang valid pada batas sesi. Timestamp/durasi dari jam penerimaan tidak dapat menggantikan bukti tersebut.

### 4. P1 — Broker anonim memungkinkan pemalsuan perintah/balasan dalam jaringan

Lokasi ZIP: `server_lokal/mosquitto.conf:15–16`; sketch 345; server 154–183.

Broker mendengarkan `0.0.0.0:1883` dengan `allow_anonymous true`; firmware memakai username/password null, tanpa ACL per perangkat. Klien yang dapat menjangkau listener dapat mengamati request dan memalsukan balasan/penutupan. Server memeriksa device ID pada topik, tetapi tidak membuktikan identitas pengirim atau kecocokan UID peserta saat menerima penutupan.

**Reproduksi handler / SQLite di memori:** penutupan sesi dengan UID kartu lain tetap menghasilkan DONE/NORMAL.

Integrasi harus memakai kredensial dan ACL perangkat pada broker SmartBilling. Jangan menjalankan konfigurasi anonim paket ini sebagai konfigurasi aplikasi.

### 5. P1 — Checkpoint NVS belum atomik dan kegagalan tulis diabaikan

Lokasi sketch: `saveActiveSession()` 277–281, `savePendingEnd()` 287–293, `processStopping()` 609–610 dan pemulihan boot 639–646.

Flag `act=true` dan `pe=true` ditulis sebelum seluruh data sesi terkait. Tiap `Preferences.put*` melakukan commit tersendiri; nilai balik `begin/put*` tidak diperiksa. Putus daya di antaranya dapat meninggalkan flag valid dengan SID/UID lama atau kosong. Relay masih dapat dinyalakan walaupun checkpoint gagal disimpan.

Ada juga celah setelah akhir NORMAL disimpan, sebelum flag aktif dibersihkan: boot berikutnya dapat menimpa pending end itu sebagai POWER_LOSS dengan durasi nol.

Ini analisis source, bukan uji power-cut fisik. Gunakan satu blob tervalidasi/berversi untuk keadaan yang harus konsisten, periksa hasil simpan dan hentikan penerimaan event baru jika persistence gagal. Implementasi [Preferences 3.3.0](https://github.com/espressif/arduino-esp32/blob/3.3.0/libraries/Preferences/src/Preferences.cpp) memperlihatkan commit pada tiap operasi put.

### 6. P2 — ACK gagal juga menghapus antrean akhir sesi

Lokasi sketch: `mqttCallback()` 322–329. Server: `handle_session_end()` 166–168.

Firmware menghapus pending end hanya berdasarkan session_id cocok, tanpa memeriksa `status`. Server mengirim NOT_FOUND jika sesi tidak ada, tetapi firmware memperlakukannya sebagai keberhasilan. Log yang belum tersimpan dapat hilang dari antrean permanen. ACK harus divalidasi lengkap, dengan kondisi sukses eksplisit dan penanganan konflik/review.

### 7. P2 — JSON valid dengan tipe salah dapat memutus loop server

Lokasi ZIP: `server_lokal/rfid_server.py:227–242`; handler 110–111.

Setelah `json.loads`, tidak diperiksa bahwa payload adalah object. Handler memakai `.get`; outer callback hanya menangkap `sqlite3.Error`.

**Reproduksi handler aktual:** payload JSON array `[]` menghasilkan `AttributeError`. Exception tersebut tidak ditangani pada callback source. Gunakan validasi schema/bentuk/ukuran sebelum handler dan pastikan pesan invalid tidak menjatuhkan subscriber. Pengujian ini memanggil handler langsung, belum menjalankan broker/Paho.

## Ketidaksesuaian tambahan dengan produk

- Tap kedua memulai countdown lima detik; event akhir baru dibuat setelah relay OFF. Ini perlu keputusan eksplisit jika ingin dipakai di SmartBilling karena batas sesi dan batas energi berubah lima detik dari waktu tap.
- Boot menutup sesi otomatis sebagai POWER_LOSS, dan request baru menutup sesi lama sebagai STALE. Perilaku tersebut belum menjadi kebijakan produk SmartBilling.
- Tidak ada pembacaan/publish PZEM, counter kWh, epoch counter atau boundary energi dalam sketch. Header cadangan PZEM tidak membuktikan integrasi sensor sudah tersedia.
- Payload tidak memiliki schema_version, boot_id, sequence_no, previous_event, reader_channel dan occurred_at sesuai kontrak kita. `req_id` acak 31 bit saja tidak mencukupi untuk rantai event lintas reboot.
- Publish firmware menggunakan PubSubClient QoS0, meskipun subscribe dan LWT memakai QoS1. [Dokumentasi PubSubClient 2.8](https://github.com/knolleary/pubsubclient/blob/v2.8/README.md) membedakan kemampuan publish dan subscribe ini. Backend SmartBilling menolak event tap QoS selain 1.
- Cooldown pada 458–465 mengukur waktu antar pembacaan UID, bukan durasi kartu benar-benar dilepas. Tap kedua yang sah dalam 2,5 detik dapat diabaikan. Deteksi removal/re-arm perlu uji hardware; [MFRC522 1.4.12](https://github.com/miguelbalboa/rfid/blob/1.4.12/src/MFRC522.cpp) menyatakan IsNewCardPresent memakai REQA dan mengabaikan kartu HALT.

## Pemeriksaan PCB dan kebutuhan tim elektro

Parser read-only atas `.kicad_pcb` dibandingkan dengan data literal `scripts/design.py`: **67 pin/net cocok, 0 selisih**. Sepuluh definisi GPIO firmware juga cocok dengan mapping U1 di PCB. Pemeriksaan ini tidak menjalankan generator, KiCad DRC/ERC, atau memverifikasi kontinuitas tembaga/fisik.

| Fungsi | GPIO / hubungan aktual di desain |
|---|---|
| RC522 SCK/MISO/MOSI/CS/RST | 4 / 5 / 6 / 7 / 10 |
| OLED SDA/SCL | 0 / 1 |
| Relay J5 IN | 3, langsung pada net RELAY_IO3 |
| LED status | 8 |
| Buzzer | 21 melalui JP1 lalu transistor Q2 |
| Cadangan PZEM RX/TX | 20 / 21 |

**GPIO21 berbagi buzzer dan TX PZEM.** Jika PZEM dipasang di J3, firmware buzzer harus dinonaktifkan/dipindahkan dan jumper JP1 perlu disesuaikan agar UART tidak menggerakkan buzzer. Jangan sekadar menambahkan kode PZEM di pin yang sudah digunakan.

**J5 belum memuat antarmuka pengubah level.** Mode open-drain bukan jaminan kompatibilitas dengan semua modul relay 5 V. Jika rangkaian IN modul menarik GPIO3 ke 5 V saat dilepas, itu melebihi rentang input pada tabel DC ESP32-C3 (maksimum VDD + 0,3 V). Minta tim elektro mengonfirmasi model/skema modul, tegangan IN dan perilaku saat boot/reset. Ini risiko bersyarat berdasarkan sambungan, bukan klaim tegangan tersebut sudah terukur. Sumber: [datasheet ESP32-C3, bagian 5.4](https://www.espressif.com/sites/default/files/documentation/esp32-c3_datasheet_en.pdf).

Yang masih perlu diserahkan/dikonfirmasi tim elektro: kesesuaian PCB/rangkaian fisik dengan revisi ini, tipe relay dan antarmukanya, alokasi GPIO21, kartu/tag uji, serta pemasangan meter fasilitas komunal bila ingin menghitung energi. Tidak perlu membangun ulang server Python untuk menghubungkannya dengan aplikasi kita.

## Bukti pemeriksaan dan batas

- Utilitas review dan hasil terstruktur lokal/ignored: `.local/rfid-team-review/review.py` dan `report.json`. Dapat diulang dengan `python .local/rfid-team-review/review.py`; source hanya dibaca, handler memakai SQLite `:memory:` dan fixture sintetis.
- Lima reproduksi handler menghasilkan temuan di atas: duplicate auth, kartu lain saat busy, durasi offline, UID penutup berbeda, payload array invalid.
- Tidak mengakses broker/DB aplikasi, perangkat serial, kredensial, router atau firewall. Tidak flash, menyalakan relay, memodifikasi source tim, commit/push atau deploy.
- Build Arduino penuh tidak dijalankan. Konfigurasi toolchain yang dipakai PZEM memiliki core 3.3.12 dan MQTT 2.5.2; library MFRC522/PubSubClient/ArduinoJson/SSD1306 tidak tersedia pada konfigurasi tersebut saat inventarisasi. Tidak memasang dependency baru. Klaim build/pengujian pada README adalah klaim pengirim, belum bukti build lokal.
- Belum menguji kartu/OLED, noise/relay, power-cut NVS, sensor, Wi-Fi/MQTT board, DRC/ERC PCB ataupun keselamatan pemasangan fisik.
