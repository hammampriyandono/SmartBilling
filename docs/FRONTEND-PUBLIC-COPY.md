# Teks dashboard untuk pengguna

Diperbarui 2 November 2026 sebagai persiapan isi dashboard sebelum deployment.

Audit ulang 3 November 2026 dan hasil penggantian delapan nama yang disetujui pengguna tersedia di [CLEAN-UI-NAMING-AUDIT.md](CLEAN-UI-NAMING-AUDIT.md). Properti kini Kos-A05 dan fasilitas Peraga Mesin Cuci. Nama perangkat Kamar 2 yang sedang terpasang ditunda; nama Owner dipertahankan. Nama produk sekarang SplitzBill.

## Pedoman

- Gunakan bahasa Indonesia yang menjelaskan data, tindakan dan hasil bagi pemilik/penghuni. Detail arsitektur, transport, debugging dan proses pengembangan berada di dokumentasi.
- Hindari catatan backend/API/PostgreSQL, idempotensi/CSRF, versi internal record, pagination server, firmware dan expo pada teks umum. Identitas perangkat/channel yang diperlukan untuk administrasi tetap tersedia.
- Pesan gagal menjelaskan tindakan selanjutnya: periksa koneksi, masuk kembali, muat ulang atau ulangi permintaan yang sama. Alasan penolakan dan batas akses tetap dipertahankan; kode respons dan pesan teknis tidak menjadi teks pengguna.
- Pertahankan label simulasi, estimasi, tarif asumsi, belum final, data parsial, pembacaan lama dan belum tersedia. Energi kumulatif tetap dibedakan dari konsumsi periode/sesi. Jangan menyembunyikan batas perhitungan yang memengaruhi tagihan.
- Kontrol menampilkan simulasi/arsip uji hanya tersedia saat menjalankan server pengembangan Vite dengan mode selain operational. Build produksi tidak menampilkan kontrol tersebut; label sumber pada data tetap mengikuti sumber sebenarnya. Mode operational existing tetap mengikuti lifecycle pemasangan dan katalog terotorisasi.
- Pertahankan informasi tujuan dan konfirmasi kendali relay, hasil yang belum dikonfirmasi perangkat, serta petunjuk mengulangi penyimpanan yang hasilnya belum pasti. Penghilangan istilah teknis tidak mengubah mekanisme pengamanan.

## Hasil pemeriksaan

Monitoring, fasilitas RFID, tagihan pemilik/penghuni, pembelian token, laporan, kesehatan perangkat, administrasi dan autentikasi telah ditinjau. Menu Billing menjadi Tagihan; kategori Tenant/Occupancy/Device menjadi Penghuni/Masa Tinggal/Perangkat. Penjelasan implementasi dan catatan berulang diringkas atau dihapus; tindakan dan isi data tidak diganti.

Build operational dan archive berhasil. Build Docker operational berhasil pada image `smartbilling-public-copy:20261102`. Enam puluh pengujian frontend lulus. Delapan belas skenario render React memeriksa navigasi sesuai peran, halaman utama dan form, data kosong/nol asli, fasilitas simulasi, tarif asumsi dan pembagian parsial. Pemeriksaan teks build memastikan beberapa frasa internal lama dan kontrol arsip tidak ikut dalam kedua build produksi.

Aset operational telah dipasang ke dashboard lokal port 3001. HTML/JavaScript/CSS yang disajikan HTTP identik dengan build. Pemeriksaan ini belum mencakup pengujian interaktif browser maupun deployment Railway. Data observasi, API, database, firmware dan pengaturan layanan tidak diubah.
