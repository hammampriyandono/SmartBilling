# Audit nama untuk clean UI SplitzBill

Tanggal: 3 November 2026. Status: **delapan nama/label yang dipilih pengguna sudah diterapkan; perangkat yang sedang terpasang di Kamar 2 ditunda dan nama Owner dipertahankan**.

Pengguna meminta pemeriksaan nama fasilitas, properti, kartu dan label lain sebagai persiapan deploy, lalu diberi tahu jika ada nama yang terasa janggal. Pemeriksaan membaca API terautentikasi dan tampilan dashboard lokal port 3001. Ini bukan pelaksanaan deployment.

## Cakupan terverifikasi

Inventaris owner: 1 properti, 2 kamar, 2 penghuni, 2 kartu RFID, 3 fasilitas, 5 perangkat, 4 aset meter, 6 catatan pemasangan dan 2 pembaca RFID. Label login, pilihan meter, fasilitas/sesi RFID, properti pada Tagihan/Token, Kesehatan Perangkat serta kategori Administrasi diperiksa. Snapshot privat yang diproyeksikan tanpa password, token, email atau UID kartu berada di `.local/clean-ui-audit/inventory.json`. Nama kartu yang menyerupai UID disamarkan pada hasil audit.

## Nama yang disetujui dan sudah diterapkan

| Kelompok | Nama sebelum perubahan | Nama sekarang |
| --- | --- | --- |
| Properti | Kost — laptop | Kos-A05 |
| Fasilitas | Peraga mesin cuci — kipas (di luar meter utama) | Peraga Mesin Cuci |
| Perangkat fasilitas | ESP32 RFID — persiapan PCB baru | ESP32 C3 RFID Peraga Mesin Cuci |
| Perangkat Kamar 2 sebelumnya | ESP32 PZEM Kamar 2 — laptop | ESP32-C3 PZEM — Kamar 2 |
| Aset meter kamar | PZEM — uji Kamar 1 | PZEM — Kamar 1 |
| Aset meter utama | PZEM — Meter Induk | PZEM — Meter Utama |
| Aset meter kamar | PZEM Kamar 2 — laptop | PZEM — Kamar 2 |
| Aset meter fasilitas | PZEM peraga kipas — luar meter utama | PZEM — Peraga Mesin Cuci |

Nama perangkat **ESP32 RFID + PZEM — peraga kipas**, yang saat ini terpasang di Kamar 2, belum diganti sesuai arahan pengguna untuk membahasnya nanti. Nama akun **Owner** dipertahankan. Perangkat meter utama masih memakai nama existing; pilihan istilah Meter Utama pada tugas ini diterapkan pada aset meter sesuai daftar pengguna.

Penggantian delapan label dilakukan dalam satu transaksi PostgreSQL dengan pengecekan pemilik, nama lama, versi record, serta delapan catatan audit. API existing hanya mendukung rename properti/kamar; untuk batch label ini digunakan pemeliharaan lokal terarah, bukan penambahan endpoint atau pembuatan ulang record. Hanya field nama/label, `row_version` dan `updated_at` pada delapan record yang berubah. Sidik data 33 tabel lainnya identik dalam transaksi; identitas/UID, status, cakupan meter, pemasangan, sesi dan nominal tetap existing. Cakupan fasilitas tetap `outside` pada record pemasangan meskipun penjelasannya dihapus dari nama atas permintaan pengguna.

Cadangan privat PostgreSQL sebelum perubahan, rencana, receipt transaksi dan hasil verifikasi ada di `.local/clean-ui-rename/`. Uji transaksi memakai rollback sebelum commit aktual; sequence ID audit dapat memiliki celah akibat uji rollback. Verifikasi setelah commit melalui koneksi baru dan browser memastikan nama tampil pada properti Tagihan/Token, fasilitas serta histori RFID, Kesehatan Perangkat dan daftar Administrasi. Inventaris dan seluruh field proyeksi selain delapan label juga dibandingkan dengan snapshot awal.

## Temuan awal sebelum keputusan pengguna

| Kelompok | Nama saat audit awal | Temuan dan konteks | Usulan awal sebelum keputusan pengguna |
| --- | --- | --- | --- |
| Properti | Kost — laptop | Nama lingkungan pengembangan masih terlihat pada pilihan properti di Tagihan dan Token. | Pilih nama kost yang akan dipakai untuk presentasi/deploy. |
| Fasilitas | Peraga mesin cuci — kipas (di luar meter utama) | Nama panjang dan memuat penjelasan pengujian. Fasilitas aktif dan muncul di RFID serta histori sesi. | Bisa dipendekkan menjadi Peraga Mesin Cuci (Kipas), dengan cakupan meter tetap dijelaskan terpisah. Jangan menyebutnya mesin cuci fisik selama beban sebenarnya kipas. |
| Perangkat | ESP32 RFID — persiapan PCB baru | Masih memakai nama tahap persiapan, tetapi pemasangan aktifnya terkait fasilitas peraga. | Nama berdasarkan peran aktual, misalnya ESP32 — Fasilitas Bersama. |
| Perangkat | ESP32 RFID + PZEM — peraga kipas | Pemasangan aktifnya sekarang di Kamar 2. Pemasangan sebelumnya pada fasilitas telah berakhir. Label lama dapat merancukan lokasi. | Nama berdasarkan Kamar 2 dengan penanda perangkat uji jika masih merupakan pemasangan sementara. Jangan mengubah mapping untuk menyesuaikan nama. |
| Perangkat | ESP32 PZEM Kamar 2 — laptop | Akhiran laptop masih terlihat. Perangkat berstatus aktif di katalog, tetapi pemasangan Kamar 2 miliknya sudah berakhir pada 2 November 2026. | Bedakan dari perangkat Kamar 2 yang sedang terpasang; keputusan lifecycle terpisah dari penggantian nama. |
| Aset meter | PZEM — uji Kamar 1 | Meter terpasang aktif pada Kamar 1, tetapi label masih menyebut uji. | Meter Kamar 1, setelah pengguna menyetujui. |
| Aset meter | PZEM Kamar 2 — laptop | Meter terpasang aktif pada Kamar 2 melalui perangkat uji yang baru. Nama masih menyebut laptop. | Meter Kamar 2. |
| Aset meter | PZEM peraga kipas — luar meter utama | Nama panjang memuat model beban dan cakupan jalur sekaligus. Masih terkait fasilitas peraga aktif. | Nama meter berdasarkan fasilitas; pertahankan penanda peraga dan keterangan cakupan yang memengaruhi pembacaan/billing. |
| Istilah meter utama | ESP32-C3 PZEM — Meter Induk; PZEM — Meter Induk | Dashboard utama memakai istilah Meter utama, sedangkan nama perangkat/aset memakai Meter Induk. | Konsisten memakai Meter utama pada label tampilan. |
| Nama akun pemilik | Owner | Nama generik bahasa Inggris tampil di header; label perannya sendiri sudah Pemilik. | Gunakan nama pemilik atau tim yang dipilih pengguna. |

## Nama yang terlihat rapi

- Kamar 1 / KMR-01 dan Kamar 2 / KMR-02.
- Penghuni Gloria dan Rozan.
- Kartu Kamar 1 (Gloria) dan Kartu Kamar 2 (Rozan); kedua kartu belum dicabut.
- Lampu Teras. Nama Mesin Cuci juga wajar, tetapi record ini **nonaktif** dan masih muncul pada daftar fasilitas RFID bersama fasilitas peraga aktif. Jangan menggabungkan atau menghapus histori kedua fasilitas berdasarkan kemiripan nama.

## Catatan tampilan lain

- Judul Administrasi pada Masa Tinggal, Pemasangan Meter dan Pembaca RFID masih memakai fallback nama kategori ditambah potongan ID. Bisa dibuat lebih mudah dibaca dengan relasi penghuni/kamar/fasilitas; ini perbaikan label UI, bukan kebutuhan mengganti ID database.
- Masih ada istilah OWNER/owner dan tenant pada teks ringkasan token, kontrol relay dan aktivasi. Untuk konsistensi bahasa Indonesia dapat dirapikan menjadi pemilik/penghuni pada teks tampilan, tanpa mengganti kode role atau kontrak API.
- Login menampilkan CAPSTONE A-05, MAKET KOS A-05 dan SplitzBill · Capstone A-05. Ini identitas tim yang sengaja dipakai pada desain sebelumnya, bukan kesalahan data. Tampilan saat deploy dapat diputuskan pengguna.
- Penanda peraga/simulasi/estimasi, data parsial, status belum diperbarui dan cakupan di luar meter utama harus tetap jelas bila relevan. Clean UI tidak boleh membuat prototipe atau data terbatas tampak sebagai pengukuran lain.

## Langkah berikutnya

Lanjutkan pembahasan perangkat yang sedang terpasang pada Kamar 2 ketika pengguna siap. Perapian judul otomatis kategori Administrasi dan istilah owner/tenant masih merupakan temuan, belum diubah pada tugas penggantian nama ini. Tidak mengubah identitas, UID kartu/perangkat, pemasangan, pembacaan, sesi atau tagihan demi perapian nama. Tidak melakukan migrasi, penghapusan, kendali relay atau deploy.
