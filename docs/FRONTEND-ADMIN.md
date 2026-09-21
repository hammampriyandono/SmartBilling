# Administrasi owner — frontend baca-saja

21 September 2026. API `/api/owner` belum menyimpan/memeriksa idempotency key. Setelah dijelaskan, pengguna memilih **“Tunda mutasi sampai backend mendukung idempotensi.”** Modul ini hanya membaca data; tidak menganggap header key sebagai jaminan deduplikasi server.

## Cara mencoba

Buka http://127.0.0.1:3000, login `owner@simulation.invalid`, lalu pilih **Administrasi**. Reload sekali jika tab memakai build lama. Gunakan password lokal existing `.local/secrets/owner_login_password`; akun pembanding `tenant@simulation.invalid` memakai secret tenant existing. Tidak membuat atau mengubah credential.

Administrasi adalah section pada URL root, terpisah dari Monitoring listrik dan Riwayat fasilitas RFID. Reload kembali ke monitoring. Tenant tidak memiliki navigasi Administrasi; component guard juga menolak render data admin untuk tenant.

Ringkasan mencakup **Kamar, Tenant, Occupancy, Kartu RFID, Fasilitas, Device, Aset Meter, Pemasangan Meter, RFID Reader**. Klik kategori untuk daftar, pencarian/filter lokal dan detail. Status temporal membedakan terjadwal/aktif/berakhir; source simulation diberi label baca-saja. Status device adalah status administrasi, bukan koneksi MQTT.

- Semua request GET, cookie/header akun existing; tidak polling otomatis. Muat ulang membaca sembilan kategori kembali; unmount/logout membatalkan request dan membuang state.
- Enam endpoint diikuti seluruh cursor `after` dengan limit 100. Tenant/occupancy/kartu belum dipaginasi server; array dari API dimuat utuh. Duplikat ID akibat join dihapus. Kegagalan halaman tidak menjadi daftar parsial yang dianggap lengkap.
- Pencarian/filter dan halaman 10/25/50 bekerja pada daftar lengkap yang telah dimuat, bukan pencarian server. Detail memakai respons daftar karena API detail belum tersedia. `row_version` hanya ditampilkan.
- Field tampilan dipilih eksplisit: tidak ada password/hash, UID kartu mentah, token invitation atau payload MQTT. Identitas device berbeda dari UID kartu. Nilai kosong ditulis Tidak tersedia; waktu WIB.
- Desktop memakai ringkasan tiga kolom/tabel; ponsel memakai kartu dan susunan label–nilai. Tombol mutasi nonaktif dengan penjelasan penundaan.

## Mutasi yang ditunda

Belum ada form/pengiriman create/update, invitation, deactivate/revoke/retire/replace/move, atau penyimpanan token. Belum diuji stale_version/CSRF mutasi/token sekali tampil. Ini bukan penyelesaian seluruh cakupan administrasi awal.

Rencana setelah idempotensi backend tersedia:

| Kategori | Kemampuan API yang akan dihubungkan |
|---|---|
| Kamar | Tambah, edit nama saja, nonaktifkan dengan waktu efektif |
| Tenant | Invitation email baru + expiry; token hanya di memori sekali, dihapus saat tutup/navigasi/logout; tanpa URL/log/localStorage |
| Occupancy | Tambah, end, move dalam properti sama |
| Kartu RFID | Daftar dengan input tersamarkan, revoke, replace assignment baru |
| Fasilitas / Device | Tambah dan nonaktifkan; tidak ada edit umum |
| Aset Meter | Tambah, retire |
| Pemasangan Meter | Tambah, retire, move tanpa memindahkan histori |
| RFID Reader | Tambah, retire; pengganti memakai record baru |

Seluruh mutasi kelak wajib reason, CSRF dan key per aksi; perubahan existing membawa row_version yang ditinjau. 409 stale_version meminta muat ulang/tinjau ulang, bukan overwrite otomatis. Backend perlu mendefinisikan replay payload sama, konflik payload berbeda, scope/expiry key, hasil tidak pasti dan perlakuan token invitation sekali tampil. Ini kebutuhan lanjutan, bukan perubahan backend yang dilakukan saat ini.

## Build dan pengujian

Dengan layanan existing sehat:

```powershell
npm run build
.\scripts\docker.ps1 compose cp dist/. backend:/app/dist/
node --test web/admin-ui.test.js web/sessions-ui.test.js test/dashboard.test.js
```

Copy hanya memperbarui aset di container berjalan. Image belum dibangun ulang; recreate dari image lama memerlukan copy ulang/build image pada pekerjaan berikutnya. Tidak perlu migration, seed, simulator atau restart database.

Hasil nyata: build lulus (peringatan bundle sekitar 616 kB), 12 test frontend lulus tanpa skip. Test mencakup field sensitif, pagination/duplikat/cursor macet, endpoint tanpa pagination, status temporal, GET/header akun, 401/403/404 dan regresi RFID/monitoring.

Browser owner memuat 2 kamar, 1 tenant, 2 occupancy, 1 kartu, 2 fasilitas, 3 device, 5 aset meter, 5 pemasangan dan 1 reader. Detail kartu tidak memuat UID; pencarian kosong dan logout diperiksa. Layout diperiksa dengan viewport desktop 1280×900 dan ponsel 390×844, termasuk detail panjang di ponsel. Browser tenant tidak memiliki Administrasi; sembilan GET owner melalui HTTP tenant ditolak 403 dan tanpa sesi 401.

Fingerprint histori sebelum/sesudah identik: 4 sesi `45732f4a2093e38b28ffe5e0706cde6e`, 8 event `71b085ebafe2e3aad388f23b4d3f7fb3`, 1457 reading `1e58cd31a8eff1d6c0d8a434cbcbb54a`. Tidak ada mutasi master/invitation/histori.

Batas: jumlah nyata kurang dari sepuluh per kategori, sehingga halaman kedua tampilan belum diuji di browser; pagination API diuji fixture helper. Belum diuji data master besar, semua browser/screen reader, gangguan jaringan nyata, serta seluruh mutasi yang ditunda. Daftar tanpa pagination API merupakan batas skala, bukan alasan mengubah backend pada tahap ini.
