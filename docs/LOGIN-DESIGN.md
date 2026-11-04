# Desain login SplitzBill dengan maket tim A-05

Keputusan pengguna, 3 November 2026: maket menjadi latar besar dengan sedikit gradasi cahaya, kemudian ditimpa form login di tengah, mengikuti kotak tengah pada referensi dashboard energi. Form dan maket sengaja bertumpuk. Referensi bentuk bangunan berasal dari `Maket_Kos_A-05-2.pdf`, terutama perspektif pada halaman 1 dan susunan pada halaman 2–3.

## Implementasi

- `web/login-screen.jsx` memisahkan presentasi login dari handler autentikasi di `web/auth.jsx`. Komponen memakai submit, error dan busy existing. Aktivasi dan pemeriksaan sesi tetap memakai alur existing.
- `web/login-screen.css` memberi panel lebar dengan maket sebagai lapisan latar, gradasi cahaya lembut dan form di tengah. Form memakai permukaan putih transparan, blur latar 16 px dan bayangan. Pada desktop empat kartu bawah menerangkan fitur tanpa angka pengukuran rekaan. Tombol tampil/sembunyikan password memiliki nama aksesibel dan `aria-pressed`; autocomplete tetap tersedia.
- `web/public/maket-kos-a05.webp` adalah interpretasi visual 3D berdasarkan maket tim, bukan foto prototipe atau indikator kondisi perangkat. Bentuk utamanya mempertahankan dua kamar, sekat tengah, teras, plafon transparan, tiga kotak sensor, mesin cuci kiri dan meter kanan.
- Aset dibuat memakai **imagegen bawaan**, dengan render halaman 1 PDF sebagai referensi. PNG RGBA asli 1536 × 1024 disimpan di `.local/login-maket/maket-original.png`, kemudian dikodekan ke WebP dengan alpha dipertahankan, kualitas 90 dan alphaQuality 100. Aset aplikasi berukuran 159.962 byte; tidak memanggil layanan gambar eksternal dari browser.

## Perapian HP — 4 November 2026

Setelah menerima screenshot dari HP pada versi yang sudah dipublikasikan, layout sampai 760 px dibuat lebih ringkas. Margin panel bertingkat diganti satu margin yang mempertimbangkan safe area; judul mengikuti alur normal agar form tetap terpisah saat teks membesar. Maket tetap menjadi latar dengan opacity lebih rendah. Form memakai lebar konten penuh, input 16 px dengan tinggi minimal 50 px, tombol password 48 px, serta jarak yang lebih teratur. Ukuran halaman dapat bertambah dan digulir saat muncul pesan kesalahan atau area layar menyempit.

Empat fitur tersedia melalui tombol **Kenali SplitzBill**, tertutup saat awal pada HP dan selalu terlihat di desktop. Tombol menggunakan `aria-expanded` dan `aria-controls`, dapat dioperasikan dengan keyboard, dan konten yang tertutup memakai `display: none`. Email memakai `autoCapitalize="none"` dan `spellCheck={false}`. Tidak menambahkan font, gambar, dependency atau layanan eksternal.

Build Vite operational dan Docker `splitzbill-login-mobile:20261104` berhasil. Pemeriksaan Chrome headless mencakup 12 ukuran 320–1920 px, fitur dengan klik/keyboard, font 125%, viewport pendek, reduced motion, password, pesan login gagal, login pemilik/penghuni, logout dan tampilan aktivasi; tanpa luapan horizontal atau exception JavaScript. Screenshot dan hasilnya ada di `.local/login-mobile/`. Pengujian ini memakai emulasi, bukan keyboard HP fisik atau Safari. Versi baru tersedia di lokal port 3001; belum di-commit/push/deploy ke Railway.

## Identitas produk dan transisi

Pengguna menetapkan nama **SplitzBill** pada 3 November 2026. Nama ini dipakai pada login, aktivasi, navigasi, footer, judul browser, judul laporan CSV dan nama berkas ekspor. README juga memakai nama produk baru. Identifier runtime seperti nama paket npm, project/volume Docker, namespace MQTT dan repository tetap mengikuti konfigurasi existing.

Usulan artwork logo kelompok sedang dicoba pada login/header dengan komponen bersama, sementara logo sebelumnya diarsipkan. Rincian dan cara pemulihan ada di [BRANDING.md](BRANDING.md).

Perapian label 3 November 2026: caption gambar memakai **KOS A-05** (kata Maket dihapus), sedangkan oval **CAPSTONE A-05** tampil tanpa titik dekoratif. Build Vite/Docker dan pemeriksaan browser pada 320/390/1440 px berhasil; aset terpasang pada dashboard lokal port 3001.

`web/motion.css` menambahkan kemunculan bertahap pada login dan maket, fade saat halaman dibuka, serta transisi warna/bayangan tombol dan input. Durasi 160–750 ms, tanpa animasi berulang. Animasi halaman memakai opacity agar tidak mengubah acuan posisi drawer/modal. Polling tidak memulai ulang animasi. Media query `prefers-reduced-motion: reduce` mematikan animasi dan transisi CSS.

## Prompt final pembuatan aset (sebelum pergantian nama produk)

```text
Use case: product-mockup. Image 1 is the architectural reference from the team's miniature boarding house PDF. Create a polished high-resolution 3D architectural miniature product rendering for a SmartBilling login website, using exactly the design of the miniature shown in this reference, not the surrounding page. Preserve its identity and topology: a rectangular wooden base, a single-storey white two-room boarding-house cutaway, one central dividing wall, two front doors with slim pale timber frames and windows, long tiled front veranda, three slender aluminium veranda columns and a transparent smoke acrylic canopy, transparent clear acrylic ceiling, exactly three low rectangular open sensor boxes aligned across the rear rooftop (left room, central communal, right room), a front-loading white washing machine on the front-left veranda with RFID reader adjacent to it, a small shared electricity meter on front-right facade. Show the interior including two simple beds and warm light wooden room floors through the clear front facade. White PVC walls, warm natural pale timber base and floor, subtle pale cyan reflections on clear acrylic, brushed aluminium supports, neutral taupe sensor enclosures with small electronics. Accurate miniature architecture, refined soft studio lighting, ambient occlusion, clean material surfaces, subtle diffuse contact shadow. Camera is elevated front-right three-quarter view matching the reference, full miniature visible, horizontally oriented composition. Isolated on a truly transparent alpha background, leave a narrow clean margin around the complete miniature. No printed labels, no dimension lines, no measurements, no annotations, no words, no arrows, no people, no extra buildings, no decorative plants, no website UI. This is a visual interpretation of the team's maquette, not an operational diagram. Build a sophisticated physical model render, not flat vector or cartoon. Output just this one isolated maquette asset.
```

## Verifikasi dan batasan

- Build Vite operational serta image Docker terbaru `splitzbill-ui:20261103` berhasil. Peringatan ukuran bundle Vite masih ada.
- Chrome headless memeriksa 11 ukuran layar, 320–1920 px, termasuk lanskap. Form berada di tengah horizontal dan menimpa latar maket pada seluruh ukuran, efek blur terhitung 16 px, tanpa luapan horizontal atau judul menimpa form. Pemeriksaan juga mencakup pesan login gagal (password dibersihkan), toggle password, masuk pemilik/penghuni, logout, dan tampilan aktivasi dengan token dummy tanpa mengirim aktivasi. Tidak ada exception JavaScript.
- Uji scrypt lulus; uji integrasi PostgreSQL pada suite auth dilewati karena `INTEGRATION_DB` tidak diaktifkan. Login owner/tenant diperiksa melalui HTTP aplikasi lokal dengan akun existing. Tidak membuat undangan atau akun uji baru.
- Bukti dan pratinjau komposisi final tersedia di `.local/login-overlay/`; aset sumber dan bukti tahap awal ada di `.local/login-maket/`. Tampilan HP diperiksa dengan emulasi Chrome; HP fisik dan Safari belum diperiksa.
- Verifikasi nama dan transisi tersedia di `.local/splitzbill-motion/`. Chrome headless memeriksa label di login, keenam halaman owner, tenant, aktivasi dan judul browser; layout login pada 11 ukuran layar 320–1920 px; serta halaman owner pada 320/390/768/1440 px. Mode reduced motion mematikan animasi dan transisi, polling tidak mengulang animasi, dan login/logout serta menu HP berfungsi tanpa exception JavaScript. Tiga tes laporan dan pemeriksaan metadata CSV lulus.
