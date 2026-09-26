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
- drawer rincian rumus, komponen kamar/RFID, reason review, serta penjelasan eksplisit untuk boundary/alokasi yang belum diekspos API;
- dialog konfirmasi finalisasi yang menjelaskan snapshot immutable dan koreksi berbasis revisi.
- daftar pembayaran manual untuk tagihan final tenant dengan filter periode, kamar, tenant dan status;
- aksi **Tandai lunas** dengan catatan opsional serta aksi **Batalkan lunas** dengan alasan wajib. Konflik versi dan retry mengikuti pola mutasi billing existing.

Semua POST memakai CSRF, `Idempotency-Key`, reason, dan `row_version` ketika diwajibkan API. Retry hasil tidak pasti mempertahankan request/key yang sama. UI tidak menghitung ulang counter atau nominal; seluruh nilai berasal dari respons backend.

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
