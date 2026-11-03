# Identitas visual SplitzBill

## Versi usulan tim, 3 November 2026

Pengguna meminta logo petir terpisah dan teks SplitzBill yang sedang dipakai disimpan dahulu, lalu mengusulkan wordmark kapital dengan petir di tengah. Versi usulan kini dipasang pada dashboard lokal untuk ditinjau kelompok; keputusan merek final belum dinyatakan pengguna.

- `web/public/brand/splitzbill-team-proposal.png`: berkas asli pengguna, transparan RGBA, 1979 × 404 px, 16.846 byte. Salinannya identik secara SHA256 dengan lampiran. Tidak digambar ulang atau dibuat ulang memakai AI.
- `web/brand-logo.jsx`: komponen bersama untuk login, pemeriksaan sesi, aktivasi dan header pemilik/penghuni. Header biru menampilkan gambar putih–kuning asli. Pada latar terang, filter SVG saat render mengubah huruf putih menjadi navy `#233d56` dan mempertahankan petir kuning; PNG sumber tetap utuh. Nama aksesibel tautan tetap SplitzBill.
- `web/brand-logo.css`: lebar disesuaikan dengan header dan layar HP, tanpa meregangkan rasio wordmark.
- `web/public/brand/splitzbill-team-icon.svg`: favicon pendamping berupa petir kuning pada bidang navy, disusun sebagai aset vektor dari bentuk petir usulan. HTML mengacu pada URL baru agar cache favicon versi lama tidak dipakai.

Nama teks produk, judul browser, identitas database/perangkat, alamat MQTT dan perhitungan tidak berubah oleh penggantian artwork logo ini.

## Arsip logo sebelumnya

- `web/public/brand/archive/splitzbill-v1-dark.svg`: petir pada kotak kuning dan teks SplitzBill untuk latar terang.
- `web/public/brand/archive/splitzbill-v1-light.svg`: versi teks putih untuk latar gelap.
- `web/public/brand/archive/splitzbill-v1-favicon.svg`: favicon lama yang disalin persis. Berkas `web/public/favicon.svg` juga tetap tersedia.

Arsip SVG wordmark mempertahankan komposisi dan gaya tulisan versi sebelumnya; hasil huruf mengikuti ketersediaan font Inter/Segoe UI/Arial. Source komponen sebelum percobaan juga dicadangkan di `.local/brand-proposal/before/` untuk mengembalikan implementasi lama secara persis.

Untuk memakai arsip melalui komponen bersama, ubah `activeLogo` di `web/brand-logo.jsx` menjadi `original`, lalu arahkan favicon di `web/index.html` ke `/brand/archive/splitzbill-v1-favicon.svg`. Bangun ulang dan pasang aset sesuai prosedur lokal. Tidak perlu mengubah data master.

## Verifikasi

Build Vite operational dan Docker `splitzbill-brand-proposal:20261103` lulus. Chrome headless memeriksa logo login pada delapan ukuran layar dan header owner pada tujuh ukuran layar, 320–1920 px, serta header tenant dan aktivasi. Tidak ada luapan horizontal/tumpang tindih dengan label proyek. Gambar sumber, arsip dan favicon termuat; login/logout dan navigasi berfungsi tanpa exception JavaScript. Pratinjau crop logo serta layar lengkap berada di `.local/brand-proposal/`. Pengujian HP memakai emulasi Chrome; HP fisik/Safari belum diperiksa. Peringatan ukuran bundle Vite masih ada.
