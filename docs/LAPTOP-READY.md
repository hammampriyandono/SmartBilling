# SmartBilling pada laptop

Disiapkan 29 Oktober 2026 dari kode main GitHub dan data laptop existing. Ini bukan pemulihan database PC. UUID baru untuk record tambahan dibuat melalui API owner, dengan audit dan idempotensi; data PC yang tidak tersedia tidak dibuat ulang seolah hasil impor.

## Pembaruan sinkronisasi — 30 Oktober 2026

Panduan terbaru: [Sinkronisasi waktu ukur PZEM](PZEM-TIME-SYNC.md). Interval tetap **60 detik**, sekarang dijadwalkan pada awal menit UTC bersama setelah NTP siap. Panel owner **Perbandingan waktu ukur** hanya membandingkan satu putaran lengkap dengan selisih antarmeter maksimal 1 detik; data yang belum lengkap tidak digabungkan menjadi total.

Firmware UTC dan cadangan sebelum pemasangan berada di `.local/utc-sync/<key>/`, terpisah dari artefak 29 Oktober di bawah. **Kamar 1, Kamar 2 dan meter utama telah diunggah**, dengan hash tulis serta koneksi MQTT/NTP terverifikasi. Tidak ada erase-all/reset NVS/counter.

**Uji ketiga sensor bersamaan berhasil** pada 30 Oktober, putaran **15.21 WIB (selisih 6 ms)** dan **15.22 WIB (5 ms)**. Kamar 2 semula tidak merespons; pengguna mengencangkan jumper PZEM, lalu pembacaan kembali masuk. Endpoint owner berstatus `aligned` dan delta energi dua putaran tersedia. Angka tetap berasal dari sensor: pada 15.22, utama 1,9 W dan kedua kamar 0,6 + 0,7 = 1,3 W; selisih 0,6 W tidak dipaksa menjadi nol. Keselarasan waktu bukan bukti akurasi atau seluruh cabang telah tercakup.

Snapshot setelah uji berisi 595 readings, termasuk **582 readings lama yang hash-nya tetap identik**. Meter/kamar/user/occupancy/sesi/event tetap identik; perangkat tetap 4 dan `last_seen_at` diperbarui oleh ingest normal. Status rinci ada di `docs/HANDOFF.md`; bukti privat di `.local/utc-sync/simultaneous-sensor-verification.json` dan `data-preservation-verification.json`. Catatan 29 Oktober di bawah adalah riwayat tahap sebelumnya.

Laptop kini kembali memakai hotspot suoweng, broker LAN **10.163.160.204:1884**, dan dashboard **http://127.0.0.1:3001**. Mode dashboard lokal pada panduan berikut menggunakan loopback; untuk ESP tetap gunakan mode LAN dengan alamat Wi-Fi aktual yang cocok dengan firmware. Jangan menganggap IP hotspot selalu sama setelah berpindah jaringan atau tersambung ulang.

## Aplikasi dan akun

Komunal bersama kini tersedia: [panduan billing bersama](SHARED-BILLING.md). Pada dua draft laptop existing, energi utama dikurangi energi kamar/fasilitas attributable, kemudian dibagi rata kepada penghuni aktif. Owner dan tenant mendapat rincian terpisah untuk kamar dan bersama; tenant hanya bagiannya sendiri. Migration 027 serta versi Docker baru telah dipasang. Tagihan masih review/estimasi karena rentang historis dan tarif operasional belum lengkap; tidak membuat tarif atau tagihan final. Mematikan rangkaian tidak menghapus histori, dan perhitungan billing tetap dapat memakai data PostgreSQL yang tersimpan.

Dashboard lokal: **http://127.0.0.1:3001**. PostgreSQL tetap memakai volume expo existing; migration024–025 telah diterapkan setelah backup. Backend memakai kode terbaru dengan mode operational. Login, katalog dan batas akses telah diuji melalui HTTP nyata.

Untuk membuka dashboard saat memakai jaringan lain, nyalakan Docker Desktop lalu jalankan dari root repository:

```powershell
.\scripts\start-dashboard-local.ps1
```

Mode ini menggunakan broker hanya pada127.0.0.1:1884 dan dashboard127.0.0.1:3001, sehingga tidak bergantung pada alamat Wi-Fi lama. Akun/ACL PZEM dan RFID serta volume existing dipertahankan; tidak build/pull/migrate/seed/reset. `.local/expo-pzem/compose.env` tidak diubah. Koneksi perangkat melalui hotspot memerlukan mode LAN dan pemeriksaan alamat aktual seperti panduan di bawah; mode lokal ini tidak menerima ESP dari jaringan luar laptop.

Pada30Oktober, Docker Engine hidup tetapi broker/backend berhenti. Percobaan start broker gagal karena alamat hotspot10.163.160.204 tidak aktif saat laptop berada di jaringan kampus. Broker dibuat ulang hanya dengan binding localhost, backend existing dinyalakan, lalu health, halaman+asset frontend dan login owner lulus. Seluruh582readings serta fingerprint master/sesi/event sebelum/sesudah identik. Tidak mengganti firmware, firewall atau jaringan Windows.

| Akun | Email | Hak akses |
|---|---|---|
| Owner | owner@simulation.local | Kedua kamar dan meter utama |
| Gloria | gloria@simulation.local | Kamar 1 pada masa tinggalnya |
| Rozan | rozan@simulation.local | Kamar 2 pada masa tinggalnya |

Password tidak ditulis di dokumen atau Git. Password owner existing berada di `.local/secrets/owner_login_password`; password akun tenant ada di `.local/laptop-runtime/accounts/gloria_password` dan `rozan_password`. Pada30Oktober akun Nadia existing diganti menjadi Gloria/gloria@simulation.local atas permintaan pengguna, dengan UUID/password/membership/occupancy yang sama. Password Gloria tetap sandi Nadia sebelumnya. Alamat `.local` pada email adalah identitas login lokal, bukan pengiriman email. Tidak ada pesan atau undangan yang dikirim ke luar.

Gloria (sebelumnya Nadia) mulai **19 Oktober 2026 pukul10.39.59,842WIB**, mengikuti awal aktif Kamar1 existing atas pilihan pengguna; tanggal3September ditolak karena mendahului umur kamar laptop. Rozan mulai **26 Oktober 2026 pukul00.00WIB**. Keduanya berakhir **20 Desember 2026 pukul12.00WIB**. Nama dan email mengikuti input pengguna. Kamar2 memiliki kode KMR-02; hardware dipasang efektif saat registrasi laptop29Oktober, tidak dibackdate ke masa tinggal.

Dataset akhir berisi2kamar/2tenant/2occupancy/3device/3meter. **284readings lama tetap identik**, begitu juga0sesi/0eventRFID. Kamar1 memiliki histori sensor nyata sebelumnya; Kamar2 belum memiliki pembacaan pada pemeriksaan akhir. Tidak membuat simulator, angka sensor pengganti, tarif/token/periode/tagihan atau kartu RFID.

## Perangkat dan konfigurasi firmware

| Titik ukur | UID | MAC yang diharapkan | Sketch privat baru |
|---|---|---|---|
| Kamar1 | esp32-pzem-10003bd0ccf0 | 10:00:3b:d0:cc:f0 | .local/laptop-runtime/firmware/kamar1/PZEM_Kamar1_Laptop/PZEM_Kamar1_Laptop.ino |
| Kamar2 | esp32-pzem-10003bb78ff4 | 10:00:3b:b7:8f:f4 | .local/laptop-runtime/firmware/kamar2/PZEM_Kamar2_Laptop/PZEM_Kamar2_Laptop.ino |
| Utama | esp32-pzem-10003bb82298 | 10:00:3b:b8:22:98 | .local/laptop-runtime/firmware/utama/PZEM_Utama_Laptop/PZEM_Utama_Laptop.ino |

Source bersama tetap `firmware/pzem-dashboard` versi GitHub: portal Wi-Fi, diagnosis NTP/UART, QoS1/queue NVS8, interval60detik, integerWh→kWh dan pinRX20/TX21. Tidak mengubah parser, protokol/backend, relay atau counter. Konfigurasi/binary baru terpisah dari folder firmware lama. Password perangkat Kamar1/Utama dipertahankan; akun Kamar2 baru memiliki secret unik yang cocok dengan ACL laptop. Secret per perangkat dan sandi portal disimpan privat; tidak ikut paket ZIP alat transfer.

Target firmware adalah hotspot **suoweng**, dengan sandi dari pengguna yang tidak dicetak. Alamat broker **10.163.160.204:1884** sempat diverifikasi saat laptop benar-benar tersambung ke hotspot. Ini endpoint LAN, belum TLS/cloud. Username tiap ESP sama dengan UID; ACL hanya mengizinkan write readings/status miliknya. Readiness ketiga mapping lulus, tetapi bukan bukti sensor baru sudah mengirim.

Manifest privat `.local/laptop-runtime/firmware-manifest.json` mencatat source hash, FQBN dan lokasi build. Hasil compile per perangkat ada di `firmware/<key>/compile-result.json`; file binary berada di `firmware/<key>/build`. Jangan menganggap binary lengkap/terbaru tanpa hasil compile lulus dan kecocokan source/config. Tidak ada upload hardware dalam tahap persiapan ini; saat upload nanti, periksa chip/MAC perangkat yang benar dan pertahankan NVS/counter.

Hasil persiapan29Oktober: **ketiga firmware lulus compile** dengan coreESP32 3.3.8/MQTT2.5.2 dan FQBN`esp32:esp32:esp32c3:CDCOnBoot=cdc`. Masing-masing memakai1.053.949byte/80%program dan42.396byte/12%RAM; file app.bin1.054.096byte. Source hash, identitas tiap sketch, header image, waktu artefak dan keberadaan UID/host/kredensial yang benar dalam binary diperiksa tanpa mencetak rahasia. Setiap perangkat memiliki binary berbeda sesuai konfigurasinya; hasil di `.local/laptop-runtime/firmware-verification.json`. **Ketiga perangkat kemudian berhasil diunggah dan diuji koneksinya satu per satu**, seperti catatan berikut. Pengujian ketiganya bersamaan dan pengukuran sensor baru belum dilakukan.

Autentikasi/ACL akun MQTT baru Kamar2 lulus pada broker terisolasi network=none, termasuk setelah restart: write status sendiri berhasil, anonymous/password salah/read perangkat/publish silang ke meter utama/observer write ditolak. Ini verifikasi software dan kredensial, bukan uji hotspot. Fingerprint owner/Kamar1/perangkat/meter existing tidak berubah; seluruh master dan284readings identik sebelum/sesudah restart PostgreSQL+backend. Sesi login pemeriksaan diakhiri.

## Kamar 1 sudah terhubung melalui hotspot

Setelah tahap persiapan, pengguna memasang ESP Kamar1 melalui USB dan meminta eksekusi. Pada **29 Oktober 2026 sekitar15.33WIB**, COM6 diverifikasi ESP32-C3rev0.4/MAC10:00:3b:d0:cc:f0. Laptop tersambung ke suoweng dengan alamat10.163.160.204/24 yang sesuai firmware. Layanan broker/backend existing yang berhenti dinyalakan kembali; database tetap memakai volume existing.

Cadangan flash4MB lengkap diverifikasi sebelum upload dan disimpan privat di `.local/laptop-runtime/firmware/kamar1/usb-20261029/flash-before-laptop.bin`. Upload normal firmware Kamar1 berhasil, seluruh hash penulisan terverifikasi, tanpa erase-all/resetNVS/resetcounter. Backup dapat memuat kredensial; jangan dibagikan atau dimasukkan Git. Serial monitor ditutup setelah uji.

Serial dan pesan MQTT langsung (bukan hanya retained) membuktikan ESP terhubung ke broker laptop, NTP tersinkron, antrean0. **PZEM belum merespons:0/25byte, no_response/sensor_invalid**. Ini belum membuktikan pengukuran PZEM; jangan mengganti data tidak tersedia menjadi nol atau menyimpulkan kerusakan hardware. Pengujian sensor/AC dilanjutkan bersama tim elektro setelah rangkaian siap.

API readiness kembali ready/database+mqtt+ingest true; mapping Kamar1 siap. Seluruh fingerprint284readings,3meter,3device,2kamar,3akun,2occupancy,0sesi/0event identik sebelum/sesudah. Latest Kamar1 tetap27Oktober2026pukul13.38.13,542WIB, **belum ada pembacaan baru setelah upload**. Bukti serial/upload/MQTT/API privat berada di folder `usb-20261029` tersebut.

Permintaan UAC untuk membuat rule TCP1884 dibatalkan sehingga tidak ada rule SmartBilling baru yang dipasang. Meskipun demikian, koneksi ESP aktual ke broker berhasil melalui konfigurasi Windows/Docker existing. Jangan mengklaim rule khusus telah diterapkan atau menonaktifkan firewall. Jika akses terputus nanti, periksa jaringan dan izin aktual sebelum menambah rule.

## Kamar 2 sudah terhubung melalui hotspot

Pengguna menjelaskan catu daya sensor memang belum disambungkan dan ingin menyiapkan ESP satu per satu. Pada **29 Oktober 2026 sekitar15.42WIB**, ESP Kamar2 di COM4 diperiksa sebagai ESP32-C3rev0.4/MAC10:00:3b:b7:8f:f4. Hotspot suoweng dan alamat laptop10.163.160.204/24 tetap sama. Tidak menyalakan atau mengubah rangkaian AC.

Cadangan flash4MB lengkap, tabel partisi dan SHA256 diverifikasi sebelum upload. Firmware Kamar2 yang sudah dikompilasi diunggah normal; hash keempat bagian tulis lulus, tanpa erase-all/resetNVS/resetcounter. Cadangan dan bukti privat ada di `.local/laptop-runtime/firmware/kamar2/usb-20261029/`; jangan membagikan backup karena dapat memuat kredensial. Firmware Kamar1 tidak diunggah ulang.

Serial serta status MQTT langsung membuktikan connected=true, NTP tersinkron dan antrean0. PZEM mencatat no_response/0byte karena pengujian ini masih tanpa catu sensor; pengukuran fisik belum diuji dan latest Kamar2 tetap null. API memverifikasi UID Kamar2 pada **KMR-02/channel1**; seluruh delapan fingerprint master/data dan284readings tetap identik. Layanan aplikasi tetap ready. Tidak ada data sensor buatan, perubahan firewall atau seed/migration. Pengujian meter utama dilanjutkan pada tahap berikut.

## Meter utama sudah terhubung melalui hotspot

Pada **29 Oktober 2026 sekitar15.48WIB**, pengguna memasang ESP meter utama melalui USB. COM7 diverifikasi ESP32-C3rev0.4/MAC10:00:3b:b8:22:98. Cadangan flash4MB lengkap beserta header, tabel partisi dan SHA256 lulus verifikasi. Firmware meter utama berhasil diunggah normal dan hash keempat bagian tulis terverifikasi; tidak erase-all/resetNVS/resetcounter. Backup dan bukti privat berada di `.local/laptop-runtime/firmware/utama/usb-20261029/`.

Serial dan pesan MQTT langsung membuktikan koneksi ke laptop10.163.160.204:1884 melalui suoweng, NTP tersinkron dan antrean0. API memverifikasi UID utama pada jenis main/channel1, tanpa relasi kamar atau fasilitas komunal. Channel1 sesuai firmware dan mapping existing; bukan asumsi channel0 dari seed simulasi.

Sensor tetap no_response/0byte pada pengujian USB tanpa catu sensor. Latest utama masih27Oktober2026pukul13.37.44,550WIB; tidak ada pengukuran baru setelah upload. Seluruh delapan fingerprint dan284readings sebelum/sesudah tetap identik, health aplikasi ready. Serial monitor ditutup. Ketiga receipt firmware kini uploaded=true dan masing-masing memiliki bukti koneksi langsung tersendiri; belum membuktikan ketiganya beroperasi bersamaan atau sensor menghasilkan pembacaan baru. Tampilan kesehatan yang dihitung dari waktu pengukuran dapat tetap stale/offline sampai pembacaan baru tersimpan.

## Pemeriksaan sebelum uji sensor atau setelah jaringan berubah

Sebelum uji sensor atau setelah jaringan berubah:

1. Sambungkan laptop dan ESP32 ke hotspot yang sama, lalu baca alamat IPv4 Wi-Fi laptop saat itu.
2. Cocokkan alamat aktual dengan MQTT_HOST firmware dan `.local/expo-pzem/compose.env` sebelum menjalankan mode LAN.
3. Periksa scope rule dalam mode tanpa mutasi:

```powershell
.\scripts\enable-pzem-dashboard-firewall.ps1 -PlanOnly
```

4. Untuk menerapkan rule diperlukan PowerShell Administrator. Helper membatasiTCP1884 ke alamat Wi-Fi privat aktif dan subnet/24 yang sama; rule existing berbeda tidak ditimpa. Sesudahnya start mode LAN dan verifikasi autentikasi/ACL sebelum menguji sensor nyata:

```powershell
.\scripts\expo-pzem.ps1 up -d --wait postgres mqtt backend
```

Pengukuran baru harus dibuktikan melalui waktu ukur/diterima pada API/dashboard, tidak hanya PUBACK atau statusconnected. Untuk Kamar2, registry/receipt lama PC tidak dipakai sebagai ID pemasangan laptop; gunakan daftar owner aktual.

## Ketika berpindah lokasi

Firmware memakai IP lokal laptop dalam hotspot, bukan IP internet HP. Pindah lokasi sendiri tidak otomatis mengubah alamat lokal, tetapi DHCP hotspot bisa memberi alamat lain setelah koneksi/perangkat/hotspot dinyalakan ulang. Jangan menganggap alamat10.163.160.204 tetap selamanya.

Portal firmware saat ini mengatur profil Wi-Fi; alamat broker masih parameter compile. Bila IP laptop berubah, konfigurasi broker/firmware harus disesuaikan. Pengaturan host/port broker melalui portal belum ditambahkan pada tahap ini. Jangan mengubah IP Windows menjadi statis atau menganggap hostname/mDNS sudah tersedia tanpa pengujian tersendiri.

Untuk hanya membuka aplikasi lokal tanpa akses ESP32, stack dasar `compose.expo-local.yaml` dapat menjalankan broker internal tanpa port LAN; wrapper expo-pzem adalah mode khusus pengujian perangkat. Pergantian mode tetap memakai volume database yang sama dan tidak memerlukan seed/reset.
