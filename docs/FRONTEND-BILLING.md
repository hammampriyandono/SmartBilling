# Frontend billing

Status 25 September 2026: UI billing owner dan tenant tersedia pada navigasi aplikasi. UI memakai API backend billing v1 secara langsung; tidak memiliki dataset mock, kalkulator nominal, atau fallback angka nol.

## Owner

Halaman **Billing** menyediakan:

- pemilih properti yang diturunkan dari kamar dalam scope owner;
- daftar dan form tarif temporal manual dalam Rp/kWh, termasuk lifecycle pensiun tarif;
- daftar revisi periode dengan total, jumlah kamar, serta hitungan preview/final/review;
- aksi hitung ulang, finalisasi, dan koreksi sesuai status backend;
- ringkasan energi kamar, total rupiah, meter utama, dan selisih meter utama–kamar;
- tabel room bill dengan kamar, tenant temporal, energi, snapshot tarif, nominal dan status;
- drawer rincian rumus, komponen kamar/RFID, reason review, counter awal/akhir dan waktu sampel aktual dari API owner;
- dialog konfirmasi finalisasi yang menjelaskan snapshot immutable dan koreksi berbasis revisi.
- daftar pembayaran manual untuk tagihan final tenant dengan filter periode, kamar, tenant dan status;
- aksi **Tandai lunas** dengan catatan opsional serta aksi **Batalkan lunas** dengan alasan wajib. Konflik versi dan retry mengikuti pola mutasi billing existing.

Semua POST memakai CSRF, `Idempotency-Key`, reason, dan `row_version` ketika diwajibkan API. Retry hasil tidak pasti mempertahankan request/key yang sama. UI tidak menghitung ulang counter atau nominal; seluruh nilai berasal dari respons backend.

### Pengaturan batas periode dan uji data nyata

1. Buka **Billing → Buat periode**. Pilih awal/akhir (jam dan detik juga ditampilkan di daftar/detail), jeda maksimum dan metode batas. Default baru180detik/inside/toleransi60detik; owner dapat mengubahnya. Untuk data lama, tombol **Atur perhitungan** menyediakan pengaturan yang sama tanpa mengubah rentang.
2. Gunakan satu jadwal tarif operasional yang mencakup seluruh periode, atau centang **Gunakan tarif khusus pratinjau uji**, isi tarif dan sumber asumsi. Tarif uji hanya untuk periode ini; tidak mengubah jadwal global. UI membedakannya dari simulasi sensor dan menonaktifkan finalisasi; API juga menolak finalisasi.
3. Simpan lalu **Hitung ulang**. Menyimpan aturan pada draft/review membuang hasil pratinjau lama; hasil harus dihitung ulang, tidak memakai nominal basi. Periode final hanya dapat diubah melalui koreksi.
4. Klik kamar untuk melihat bukti counter/waktu sampel dan jumlah sampel. Buka **Bukti meter utama dan fasilitas** untuk pembacaan pembanding. Metode inside hanya menghitung delta sampel terpilih; tepi periode tidak diisi otomatis. Data kosong/satu sampel, batas di luar toleransi, gap besar, reset dan kualitas invalid tetap review/null.

Pratinjau lokal28Oktober2026pukul15.40–15.50WIB memakai pembacaan tersimpan ketiga PZEM, tarif asumsi1444.70Rp/kWh dan aturan180/60detik. Kamar1:0kWh/Rp0 (counter stabil yang valid), Kamar2:0.005kWh/Rp7, utama:0.005kWh. Hasil draft, tidak difinalisasi/ditagihkan. Periode Oktober lama dan jadwal tarif global dipertahankan. Nilai ini contoh bukti pengujian, bukan data mock atau janji nilai dashboard berikutnya.

### Histori parsial pada periode terpilih — 22 Oktober 2026

Saat owner memilih periode, panel **Pemakaian yang sudah tercatat** membaca `/api/owner/billing-periods/:id/observed-usage` setiap lima detik. Panel ini membaca histori PostgreSQL tanpa menjalankan Hitung ulang atau mengubah hasil final. Data lama tetap terlihat ketika sensor berhenti mengirim; waktu pembacaan terakhir dan alasan parsial ditampilkan. Jika API gagal, hasil terakhir dipertahankan dengan pesan pembaruan gagal.

Backend menjumlahkan selisih interval valid dengan aturan monitoring existing (default jeda maksimum120detik), tanpa interpolasi. Subtotal valid tetap tersedia meskipun batas periode/tarif/rekonsiliasi utama belum lengkap. Data hilang/satu sampel tetap belum tersedia, sedangkan interval valid dengan delta0 menampilkan0. Sumber simulasi/campuran diberi label; mode observation mengecualikan meter yang memuat simulasi dalam rentang. Batas100000baris menghasilkan pesan rentang terlalu besar tanpa mengklaim total.

Ini bukan tagihan final, saldo token, atau alokasi tenant. Nominal periode/kamar yang masih review tidak ditampilkan sebagai Rp0 dari agregat preview yang belum lengkap. Tagihan final nol yang valid tetap ditampilkan. Belum ada perubahan kalkulasi/shared/finalisasi atau sinkronisasi otomatis tarif token ke Billing.

### Estimasi biaya berjalan — 24 Oktober 2026

Panel periode kini menjadi **Pemakaian dan estimasi biaya berjalan**, dengan kartu **Estimasi biaya sementara**, biaya per kamar, serta tabel **Estimasi bagian penghuni**. Periode terbaru properti dipilih otomatis ketika halaman dibuka. Endpoint observed-usage existing tetap dipolling lima detik, dan nominal selalu dihitung di backend. Tagihan hasil hitung/final existing tetap terpisah dan tidak berubah karena polling.

- Sumber energi adalah interval valid dari aturan monitoring yang sama; fungsi dailyConsumption hanya menambahkan opsi internal includeIntervals, tanpa mengubah bentuk respons monitoring existing.
- Jadwal tarif properti yang mencakup masing-masing interval diprioritaskan. Jika belum ada jadwal yang beririsan dengan periode, estimasi memakai default expo1444.70Rp/kWh dari konstanta konversi token yang sama. Ini biaya energi saja, belum termasuk pajak pengisian dan bukan tarif operasional yang diverifikasi. Tidak memakai nominal pembelian sebagai nominal tagihan atau membebankan pemakaian lama ke token baru.
- Tarif overlap, batas tarif melintasi interval, tarif invalid/pensiun atau interval jadwal yang tidak tercakup menghasilkan biaya Belum tersedia; harga tidak diam-diam diganti default jika periode sudah memiliki jadwal. Dasar harga dan referensinya tersedia pada bagian **Dasar estimasi biaya**.
- Alokasi sementara diberikan kepada satu occupancy sah yang mencakup seluruh interval. Tanpa penghuni masuk ke Owner/tanpa penghuni; beberapa penghuni, sumber occupancy simulasi, atau pergantian di tengah interval ditandai Belum dapat dibagi/Perlu ditinjau. Belum menetapkan kebijakan bagi rata baru untuk beberapa penghuni sekaligus.
- Arus rupiah dihitung dengan BigInt presisi21desimal, pembulatan half-up per kamar. Bagian pembulatan dibagikan memakai sisa terbesar dan ID sebagai tie-break sehingga jumlah bagian sesuai biaya kamar. Frontend memformat string integer dengan BigInt, termasuk nominal di atas safe integer.
- Cakupan tahap ini hanya meter kamar dan estimasi bagiannya di halaman owner. Biaya komunal/shared/RFID, saldo token, FDI, penagihan final otomatis dan estimasi tenant API belum ditambahkan. Pembayaran/tagihan final tidak diubah; API tetap owner-only dan memeriksa kepemilikan periode.
- Metadata tarif, timezone dan occupancy dimuat dari properti yang sama. Waktu ditampilkan menurut timezone properti. Histori yang parsial/stale tetap terlihat dan ditandai; tidak mengarang konsumsi pada gap.

## Tenant

- Navigasi tenant memiliki menu **Tagihan Saya** yang benar-benar membuka daftar tagihan.
- Dashboard monitoring tenant memuat kartu **Tagihan Terbaru** dari API nyata. Jika ada tagihan final, kartu menampilkan periode, kamar, total Rupiah, status final, dan tombol **Lihat Tagihan**. Jika belum ada, kartu menjelaskan bahwa tagihan baru muncul setelah owner menghitung dan memfinalisasi periode.
- Tombol kartu membuka halaman **Tagihan Saya**. Halaman ini hanya membaca `/api/billing-periods` dan detail final milik occupancy akun, lalu menampilkan semua share final dengan periode, kamar, konsumsi, tarif, nominal dan aksi detail.
- Drawer detail menampilkan rumus `kWh × Rp/kWh = total`, konsumsi kamar, alokasi RFID jika tersedia, dan nominal backend. Boundary meter awal/akhir dan daftar sesi individual belum diekspos API billing v1, sehingga keduanya dinyatakan tidak tersedia dan tidak direka oleh frontend.
- Kartu terbaru, daftar, dan drawer tenant menampilkan status **Belum dibayar** atau **Lunas** dari backend. Jika lunas, detail juga menampilkan waktu dan catatan owner bila ada.

## Status dan batas

- `source != production` selalu berlabel **Pratinjau simulasi**, dengan warna review, meskipun status lain salah terbaca.
- `null` energi/nominal selalu **Perlu ditinjau**, tidak pernah nol.
- Rekonsiliasi properti review dijelaskan terpisah dari kelayakan room bill.
- UI tidak menawarkan finalisasi simulation.
- Database lokal saat verifikasi belum memiliki tarif, periode, atau tagihan final. UI tidak membuat data permanen hanya untuk demo.
- Pemilih properti bergantung pada kamar owner karena API backend belum menyediakan daftar properti khusus. Properti tanpa kamar belum dapat dipilih dari UI ini; kontrak backend tidak diubah.

## Verifikasi

```powershell
node --test web/billing-data.test.js web/admin-mutations.test.js web/sessions-ui.test.js test/dashboard.test.js
npm run build
npm run check
```

Verifier HTTP baca-saja menggunakan password secret lokal dan tidak mencetaknya:

```powershell
.\scripts\docker.ps1 compose run --rm --no-deps `
  -v "${PWD}/scripts/verify-billing-ui-live.js:/app/scripts/verify-billing-ui-live.js:ro" `
  -v "${PWD}/.local/secrets/owner_login_password:/run/test/owner_password:ro" `
  -v "${PWD}/.local/secrets/tenant_login_password:/run/test/tenant_password:ro" `
  -e AUTH_OWNER_PASSWORD_FILE=/run/test/owner_password `
  -e AUTH_TENANT_PASSWORD_FILE=/run/test/tenant_password `
  -e AUTH_TEST_BASE_URL=http://backend:3000 `
  backend node scripts/verify-billing-ui-live.js
```

Hasil aktual 25 September: keseluruhan suite `npm test` 50 lulus dan 6 integrasi dilewati ketika dijalankan tanpa `INTEGRATION_DB=1`; test frontend billing mencakup filter final-only, null, label dan filter pembayaran, serta mutasi idempotent. Build Vite, check, dan diff check lulus. Verifier API menemukan dua properti owner; endpoint tarif/periode/pembayaran owner 200; daftar final tenant 200 dan kosong; namespace owner untuk tenant 403. Browser dengan akun tenant lokal menampilkan menu **Tagihan Saya**, kartu **Tagihan Terbaru**, empty state yang benar, dan tombol kartu berhasil membuka halaman daftar 0 tagihan tanpa nominal nol. Build menghasilkan warning chunk sekitar 659 kB yang belum dipecah.
