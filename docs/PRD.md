# PRD — Web App Capstone A05

Versi 1.0, 9 September 2026. Acuan pekerjaan fullstack; kebutuhan hardware dan evaluasi akademik dikoordinasikan oleh tim.

## Tujuan

Membuat web app yang menerima data kelistrikan dari ESP32 melalui MQTT, menyimpan data historis, menampilkan monitoring owner/tenant, mencatat sesi fasilitas komunal berbasis tap RFID, dan menjalankan perhitungan biaya di backend.

Sistem mendukung pengamatan prototipe selama tujuh hari. Pengguna dapat membandingkan konsumsi antarkamar dan antarwaktu berdasarkan data yang benar-benar tersimpan.

## Pengguna dan lingkup

| Pengguna | Kebutuhan |
|---|---|
| Owner | Melihat seluruh kamar miliknya, meter utama/fasilitas, histori dan perbandingan, status perangkat, sesi serta estimasi biaya. |
| Tenant | Melihat konsumsi kamar pada masa tinggalnya, sesi yang terkait identitasnya, dan biaya yang menjadi bagiannya. |
| Tim pengembang | Menjalankan aplikasi lokal lewat Docker, menguji alur tanpa hardware melalui simulator, lalu deploy di Railway. |

Prototipe proposal maksimal tiga kamar. Jenis titik ukur: utama, kamar, komunal. Jumlah unit aktif yang sebenarnya perlu diambil dari konfigurasi proyek; jangan menanam jumlah tetap dalam kode. Sensor PZEM-004T dan ESP32-C3 adalah perangkat pada proposal.

## Kebutuhan MVP

### F01 — Data masuk dan tersimpan

- Backend subscribe broker MQTT dan mengenali sumber pesan berdasarkan mapping perangkat/meter.
- Validasi bentuk payload dan satuan; simpan nilai kWh kumulatif, waktu pengukuran, waktu diterima, dan identitas sumber.
- Tegangan, arus, daya, frekuensi dan faktor daya ditampilkan ketika tersedia dari firmware. Parameter hilang tidak diganti nol.
- Data invalid/konflik dicatat untuk pemeriksaan. Pengiriman ulang tidak menambah pembacaan ganda.
- Perangkat/sumber yang tidak dikenal tidak otomatis diberi akses ke kamar mana pun.

### F02 — Dashboard monitoring

- Owner memiliki ringkasan dan detail kamar, data utama/komunal yang tersedia, serta waktu pembaruan terakhir.
- Tenant hanya mendapat akses data yang sesuai haknya.
- Tampilkan satuan V, A, W dan kWh dengan konsisten; nilai terakhir yang sudah lama diberi penanda data belum diperbarui.
- Bedakan loading, belum ada data, koneksi gagal, data terputus dan data valid.
- Tampilan dapat digunakan pada desktop dan ponsel. Stack React + Vite (JavaScript), Recharts dan CSS biasa disetujui 14 September 2026 untuk dashboard lokal; polling health/latest lima detik. Desain visual awal merupakan pilihan implementasi.

### F03 — Histori dan perbandingan

- Filter kamar dan rentang waktu; sediakan tampilan tujuh hari ketika tersedia.
- Grafik daya terhadap waktu, konsumsi kWh harian dan tabel/ringkasan periode.
- Bandingkan kamar pada rentang yang sama dan dua tanggal/rentang dengan durasi yang jelas.
- Jika periode belum lengkap, tampilkan cakupan/indikasi parsial; jangan menyatakan pemakaian turun ketika sebenarnya data tidak ada.
- Konsumsi dihitung dari delta counter yang valid pada batas rentang, dengan penanganan reset dan gap.
- Zona waktu bangunan dipakai untuk label dan batas hari; penyimpanan menggunakan timestamp berzona.
- Tidak menghapus data setelah tujuh hari. Membandingkan dua minggu penuh membutuhkan minimal 14 hari rekaman.

### F04 — Login dan pengelolaan minimum

- Login owner/tenant dan pemeriksaan hak akses pada API.
- Mapping pengguna, kamar, kartu RFID, perangkat dan meter dapat dikonfigurasi secara terstruktur. UI admin lengkap bukan syarat milestone pertama; seed/config lokal yang terdokumentasi dapat digunakan untuk prototipe.
- Password hanya disimpan sebagai hash. Kredensial MQTT/database tidak dikirim ke browser.

### F05 — Sesi RFID

- Tap yang valid memulai sesi; tap berikutnya yang sesuai mengakhiri sesi.
- Backend mengaitkan identitas pengguna dengan fasilitas serta energi/waktu awal dan akhir.
- Histori menampilkan status aktif/selesai/perlu diperiksa, durasi dan energi jika valid.
- Retry event yang sama tidak menciptakan sesi baru atau men-toggle sesi dua kali. Bedakan retransmisi pesan dari tap fisik baru.
- Alur tap kartu berbeda dan multi-peserta belum dipastikan. Jangan mengubah keputusan tap-to-tap atau membuat penutupan sesi otomatis sebagai perilaku tersembunyi.

### F06 — Perhitungan di backend

- Seluruh nominal yang ditampilkan berasal dari backend dengan sumber tarif/periode yang jelas.
- Komponen model: energi kamar, komunal attributable melalui sesi, dan shared.
- Pisahkan perhitungan dari handler MQTT dan komponen UI agar kebijakan tim dapat diganti.
- Bila input/kebijakan untuk tagihan final belum lengkap, berikan status estimasi/belum tersedia; jangan menerbitkan nominal final rekaan.
- Struktur ERD mendukung billing rinci. Fitur koreksi/revisi dan pembagian kompleks dapat dikerjakan bertahap; bukan penghalang monitoring dan pengambilan data.

### F07 — Operasi dan deployment

- Aplikasi berjalan lokal dengan Docker; sertakan instruksi startup, migration dan konfigurasi contoh.
- Target Railway: broker MQTT, backend/dashboard dan PostgreSQL dengan penyimpanan persisten.
- Proses subscriber berjalan terus selama eksperimen, terlepas dari apakah dashboard sedang dibuka.
- Dashboard mengambil histori lewat API/database; tidak mengambil histori dari log console Railway.
- Restart/deploy ulang tidak menghapus data tersimpan. Kegagalan koneksi memicu reconnect/retry terukur; jangan menjanjikan nol kehilangan data tanpa pengujian firmware dan broker.

## Di luar lingkup saat ini

- Perancangan rangkaian, kalibrasi sensor, pemrograman firmware produksi, relay/kendali listrik.
- Menetapkan ulang metode fairness/FDI dan mengerjakan seluruh pengujian akademik tim.
- Payment gateway, penagihan/pembayaran otomatis, aplikasi mobile native, klasifikasi perangkat listrik, AI prediksi konsumsi.
- Memvalidasi semua kasus multi-peserta, pembagian kamar kompleks dan biaya resmi sebelum monitoring dapat dibuat.

## Tahapan implementasi

| Tahap | Hasil yang bisa diperiksa |
|---|---|
| 0 | Audit repository dan stack; pemetaan dokumen ke kode existing. |
| 1 | Jalur MQTT simulasi → database → API → histori dashboard, dengan container lokal. |
| 2 | Owner/tenant, hak akses server, filter dan perbandingan, status kualitas data. |
| 3 | Sesi RFID tap-to-tap dan modul estimasi billing di backend. |
| 4 | Konfigurasi Railway, uji restart/reconnect dan smoke test dengan perangkat nyata. |
| 5 | Pengambilan data nyata tujuh hari dan evaluasi tampilan historis. |

Tahap dapat disesuaikan dengan kode yang sudah ada. Data simulasi tujuh hari tidak berarti pengamatan nyata tujuh hari telah selesai.

## Kriteria penerimaan

1. Satu pesan sensor valid diterima, tersimpan sekali, dan muncul pada detail meter yang tepat.
2. Pengulangan identitas pesan yang sama tidak menggandakan baris atau energi; payload rusak tidak merusak subscriber.
3. Dataset uji dengan konsumsi harian diketahui menghasilkan grafik/perbandingan yang sesuai; reset/gap tidak menghasilkan lonjakan energi palsu.
4. Tenant yang mencoba meminta data tenant/kamar lain ditolak API; pembatasan juga mencakup histori masa tinggal.
5. Dua tap valid menghasilkan satu sesi dengan waktu dan delta energi yang benar. Retry event tidak dihitung sebagai tap berikutnya.
6. Histori tersimpan tetap tersedia setelah restart/redeploy yang diuji.
7. UI membedakan data belum ada, data simulasi, data parsial dan data nyata; nilai estimasi dibedakan dari tagihan final.
8. Container berhasil dibangun dan dijalankan; langkah konfigurasi broker/DB dan variabel lingkungan terdokumentasi tanpa secret.
9. Uji nyata tujuh hari dinyatakan selesai hanya setelah pengamatan tersebut benar-benar dilakukan; dokumentasikan waktu mulai/akhir, cakupan data dan gangguan.

## Detail yang diambil dari repository/koordinasi

Frontend dan ORM, broker yang digunakan, kontrak JSON/topik firmware, interval sampling/publish, zona waktu bangunan, tanggal pengamatan, sumber tarif, serta desain UI. Gunakan konfigurasi atau default sementara yang dicatat untuk hal yang belum ada; jangan membuat klaim sudah disepakati tim.
