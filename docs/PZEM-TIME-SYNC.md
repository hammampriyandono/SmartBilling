# Sinkronisasi waktu ukur PZEM

Perubahan 30 Oktober 2026 mempertahankan interval 60 detik. Tujuannya membandingkan meter utama dan cabang pada putaran waktu yang sama. Nilai sensor, timestamp lama, counter kWh dan perhitungan billing tidak diubah untuk menyamakan tampilan.

## Jadwal firmware

Source bersama ada di `firmware/pzem-dashboard`. Setelah NTP siap, `UtcSampling` menunggu awal menit UTC berikutnya. Perangkat yang boot pada detik 15 atau 47 sama-sama menjadwalkan putaran berikut pada detik 00. Setelah reboot, checkpoint terakhir tetap dibaca dari namespace NVS existing.

- Satu percobaan pembacaan per putaran; tidak mengejar putaran yang sudah lewat.
- Default implementasi: mulai paling lambat 1 detik setelah batas menit dan selesai paling lambat 2 detik. Jika terlambat, data tidak dikirim sebagai sampel selaras. Ini batas software untuk pemilihan sampel, bukan hasil kalibrasi sensor.
- Timestamp `measured_at` tetap waktu aktual setelah pembacaan UART selesai; tidak dibulatkan menjadi 00. Tidak membuat sampel pengganti atau menginterpolasi.
- Koreksi jam mundur tidak mengulang putaran lama; loncatan maju melewati putaran yang hilang. Timestamp yang tidak maju tetap ditahan sesuai guard existing.
- Operasi MQTT sinkron ditunda pada 4 detik terakhir sebelum jadwal, sehingga timeout jaringan tidak sengaja menunda pembacaan. Loop tetap tidak menjamin hard realtime; jika terlambat, putaran dilewati secara eksplisit.
- Pending MQTT lama direplay dengan boot/sequence/timestamp/payload aslinya. Struktur checkpoint, counter_epoch, pin RX20/TX21, kontrak MQTT v1/QoS 1 serta portal Wi-Fi tetap.

## Perbandingan dashboard owner

Endpoint read-only `GET /api/owner/meter-comparison?property_id=...` memeriksa role owner dan kepemilikan properti. Tenant tidak dapat mengaksesnya. Query memilih pemasangan aktif dan menyaring simulasi/arsip uji; tidak menulis database atau mengubah tagihan.

Putaran lengkap memerlukan tepat satu sampel production/valid pada setiap meter aktif terdaftar, dalam 2 detik pertama menit dan selisih antarmeter maksimal 1 detik. Duplikasi sampel dalam putaran dianggap ambigu. Jika satu meter belum mengirim, dashboard dapat mempertahankan putaran lengkap sebelumnya maksimal 120 detik dengan label menunggu; tidak mencampur sampel baru dan lama menjadi satu total. Jika belum tersedia, angka perbandingan tetap Belum tersedia. Timestamp terakhir yang berbeda ditampilkan hanya sebagai informasi, tanpa menjadi nilai pembanding.

Tabel menampilkan V/A/W/counter kWh dan waktu aktual tiap meter. V dan A tidak dijumlahkan. Jumlah daya serta selisih utama dikalkulasi di backend memakai desimal presisi. Energi memakai delta counter pada dua putaran lengkap berurutan 60 detik dengan epoch sama dan counter tidak turun. Waktu awal/akhir aktual per meter tetap ditampilkan; interval pengukuran mendekati sama dalam toleransi waktu, bukan klaim pengukuran serentak sempurna.

Jumlah cabang hanya mencakup meter yang terdaftar. Selisih utama–cabang tidak otomatis dinamai konsumsi komunal atau rugi-rugi. Cakupan jalur dan ketelitian sensor perlu diverifikasi oleh tim hardware. Katalog laptop saat implementasi masih 2 meter kamar dan 1 utama; reader RFID bukan meter energi komunal.

## Pengujian

Scheduler C++ diuji untuk boot berbeda, batas menit, loop terlambat, koreksi clock maju/mundur dan checkpoint setelah reboot. Tes Node mencakup penantian satu meter, timestamp asli, angka presisi besar/selisih negatif, null/nol, reset/gap/duplikasi/simulasi serta anonymous 401/tenant 403/properti asing 404/filter 400. Uji PostgreSQL terisolasi menjalankan query nyata, presisi kWh dan penyaringan simulasi; fixture di-rollback tanpa volume aplikasi.

Firmware privat sinkron disiapkan terpisah di `.local/utc-sync`, memakai UID/MAC dan kredensial existing. Binary baru tidak dianggap terpasang sebelum ada receipt upload, verifikasi MAC/hash serta pemeriksaan serial/MQTT. Backup flash privat dapat memuat kredensial; jangan masukkan Git. Status upload dan hasil hardware aktual dicatat di HANDOFF, bukan disimpulkan dari compile atau health aplikasi.

## Hasil uji perangkat — 30 Oktober 2026

Ketiga ESP telah diunggah setelah cadangan flash dan identitas diverifikasi, tanpa reset NVS/counter. Setelah pengguna memasang kembali rangkaian dan memperbaiki jumper PZEM Kamar 2 yang longgar, dua putaran nyata berurutan lolos: 15.21 WIB dengan spread 6 ms dan 15.22 WIB dengan spread 5 ms. Endpoint produksi berstatus `aligned`; delta counter dua putaran tersedia. Ini bukti keselarasan pada dua putaran tersebut, belum pengujian kestabilan jangka panjang atau kalibrasi sensor.

Pada putaran kedua, daya utama 1,9 W dan jumlah kedua kamar 1,3 W. Selisih 0,6 W tetap terlihat; penyebab fisiknya belum diuji. Counter belum bertambah selama interval uji singkat, sehingga delta tercatat 0 kWh. Tegangan, arus dan counter kumulatif tidak dipaksa agar dapat dijumlahkan. Bukti dan timestamp lengkap ada di `docs/HANDOFF.md` serta laporan privat `.local/utc-sync/simultaneous-sensor-verification.json`.
