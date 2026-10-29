# Percobaan pendaftaran kartu lewat USB — 29 Oktober 2026

Status akhir: **belum ada kartu terdaftar; UID belum berhasil dibaca**. Firmware aplikasi asli RFID sudah dikembalikan dan monitor serial ditutup.

## Lingkup dan target

Pengguna mengonfirmasi RFID memakai USB saja, suplai AC dilepas. Kartu 1 ditujukan ke Kamar 1, kartu 2 ke Kamar 2. Akun dipilih berdasarkan occupancy aktif yang benar-benar dibaca dari API expo lokal3001:

| Kartu | Kamar | Penghuni aktif saat pemeriksaan | Hasil |
|---|---|---|---|
| 1 | Kamar 1 | Nadia Putri (contoh) | UID belum terbaca, tidak didaftarkan |
| 2 | Kamar 2 | Rozan | Menunggu kartu 1/reader stabil, tidak didaftarkan |

Foto layout tambahan menunjukkan relay dan catu HLK-5M05 pada papan yang sama. Ini berbeda dari PCB v1.1 eksternal-relay yang diperiksa sebelumnya. Jangan menganggap polaritas relay/modul antarmukanya sudah dikonfirmasi dari paket v1.1.

## Bukti dari perangkat

- USB Serial/JTAG COM6, ESP32-C3 rev0.4, MAC `70:af:09:22:0d:d0`, berbeda dari ketiga node PZEM existing.
- Firmware awal mengeluarkan pesan RC522 merespons/terdeteksi dan register versi0x92, dengan format berbeda dari kedua sketch kiriman. Tidak ada UID yang teramati setelah pengguna mengonfirmasi beberapa tap. Menurut pengguna, OLED kosong dan buzzer yang sebelumnya berbunyi kini diam pada kondisi USB saja.
- Pembaca UID sementara dibuat privat di `.local/rfid-cards/UID_reader/UID_reader.ino`: hanya SPI RC5224/5/6/7/10 dan serial115200. Tidak menggunakan Wi-Fi, MQTT, OLED, PZEM, NVS, GPIO relay3 atau buzzer21. MFRC5221.4.12 dipasang di user library terpisah `.local/rfid-cards/arduino-user`; core existing3.3.12 dipertahankan.
- Versi awal memakai REQA/select/HALT, versi lanjutan memakai WUPA/select/HALT, gain maksimum dan status RF. Build penuh kedua versi lulus: awal305.356byte/RAM14.540byte, lanjutan306.356byte/RAM14.548byte. Compile di sandbox gagal DLL relocation; pengulangan di luar sandbox lulus.
- Kedua upload hanya menulis partisi aplikasi aktif app0 pada0x10000, memakai ROM/no-stub. Hash tulisan terverifikasi. Pengguna melakukan tap ulang setelah pembaca sementara terpasang, tetapi tidak ada UID valid yang tertangkap.
- Saat diagnosis RF/WUPA, register versi berubah antara0x92,0x00,0xFF dan beberapa nilai lain0x80/0x93/0x90; antenna mask berubah0/3 dan status RF Error. Ini bukti pembacaan register/kondisi reader belum stabil ketika RF dicoba, **bukan bukti spesifik bahwa modul rusak atau kartu salah**. Penyebab catu, ground, sambungan, integritas SPI atau komponen belum dipastikan secara fisik.

## Cadangan dan pemulihan akhir

- Percobaan backup dengan stub/baud460800 terputus sekitar14%. Tidak dipakai sebagai dasar restore. Backup ulang melalui ROM/no-stub115200 berhasil membaca4.194.304byte dalam221,8detik.
- Cadangan lengkap: `.local/rfid-cards/flash-before-uid-reader-retry.bin`, SHA256 `a66e8bb7513b33b356b5084b87b8405db5474c7f00f90fb2836406bde7bdff52`. Berkas privat/ignored; dapat berisi konfigurasi pengguna, jangan commit atau unggah.
- Tabel partisi dari backup dibaca sebelum upload: NVS0x9000, otadata0xE000, app0/OTA0 mulai0x10000 ukuran0x140000; app1 belum berisi image. Tidak mengubah bootloader/tabel partisi/NVS/otadata.
- Setelah UID tetap tidak terbaca, aplikasi asli dipulihkan dari seluruh rentang app0 backup:1.310.720byte ke0x10000. MAC diperiksa ulang sebelum restore; hash tulisan terverifikasi. Pembaca sementara **tidak** menjadi firmware akhir board.
- Pembacaan ulang64KiB pertama sebelum dan setelah restore membuktikan bootloader, tabel partisi, NVS dan otadata identik byte demi byte dengan backup. Bukti `.local/rfid-cards/flash-system-verification.json` dan `flash-system-restored-verification.json`. Monitor serial milik tugas ini ditutup; port tidak sengaja dibiarkan terkunci.

## Aplikasi lokal dan pendaftaran

- Aplikasi3001 awalnya tidak berjalan. Docker Desktop mereproduksi error rename socket `sailor-ingest.sock`, kemudian `engine.sock`. Folder runtime dicadangkan, bukan dihapus. Percobaan awal berhenti karena folder engine dibuat ulang saat proses startup masih tersisa. Setelah proses startup Docker yang gagal dihentikan dan dua folder dicadangkan bersamaan, Engine kembali tersedia.
- Cadangan runtime pertama berakhiran `backup-rfid-20261029-000111`, berikutnya `backup-rfid-20261029-000504`, masing-masing untuk `C:/Users/Admin/AppData/Local/Docker/run` dan `C:/Users/Admin/AppData/Local/docker-secrets-engine`. Receipt `.local/rfid-cards/docker-runtime-backup.json` menunjuk pasangan akhir. Tidak melakukan factory reset, unregister WSL, menghapus volume atau mengganti kredensial.
- Hanya container expo existing postgres/mqtt/backend dinyalakan kembali dengan Compose start, tanpa recreate/build/seed/migration. Container archive-check tetap berhenti. Pemeriksaan akhir `/health/ready`:HTTP200/database=true/mqtt=true/ingest=true.
- API owner sebelum dan sesudah diagnosis menunjukkan0kartu aktif untuk kedua penghuni. Target disimpan di `.local/rfid-cards/targets.json`. Helper `register.mjs` memakai CSRF, action snapshot/idempotency key persisten dan readback, tetapi **belum dijalankan**, karena file UID kartu valid belum ada. Tidak membuat UID sintetis, akun baru atau sesi RFID contoh.
- Source tim dan source aplikasi produksi tidak diubah. Tidak mengendalikan relay, mengubah firewall/router, mempublish telemetry uji, menjalankan seed/migration, reset counter/PZEM, erase NVS, commit/push atau deploy.

## Langkah berikutnya

Minta tim elektro memeriksa catu3,3V pada RC522/OLED saat USB saja, ground bersama, konektor dan jalur SPI aktual. Pastikan apakah desain memang menyuplai periferal dari USB atau memerlukan catu DC pada jalur yang dirancang. Jangan menyambung jumper/catu berdasarkan tebakan atau memakai USB dan AC bersamaan.

Setelah reader stabil, gunakan firmware/pembaca UID yang sesuai rangkaian aktual untuk mengambil kartu1 terlebih dahulu. UID harus diperoleh langsung dari kartu, lalu didaftarkan lewat API owner ke penghuni aktif; berikutnya kartu2. Pendaftaran kartu belum berarti perangkat/fasilitas/meter komunal atau alur sesi fisik sudah diintegrasikan.
