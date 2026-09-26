# Frontend Administrasi owner

Diperbarui 23 September 2026. Mode baca-saja 21 September digantikan UI mutasi setelah backend idempotensi tersedia dan pengguna menyetujui kelanjutan. Backend, migration, auth, MQTT, simulator dan billing tidak diubah.

## Cara mencoba

Buka http://127.0.0.1:3000/, masuk sebagai `owner@simulation.local`, lalu pilih **Administrasi**. Password memakai secret lokal existing `.local/secrets/owner_login_password`; tidak ditulis di dokumentasi. Akun pembanding `tenant@simulation.local` memakai `.local/secrets/tenant_login_password`. Administrasi berupa section pada URL root, bukan route baru; reload kembali ke Monitoring.

Pilih kategori → Tambah (atau Invitation tenant). Untuk aksi existing: Lihat detail → pilih aksi → tinjau versi → isi alasan → Simpan perubahan. Semua waktu form memakai zona browser dan presisi detik, lalu dikirim sebagai UTC. Akhir occupancy opsional kosong secara default. Waktu akhir/efektif harus setelah awal record.

| Kategori | Form dan aksi API existing |
|---|---|
| Kamar | Tambah, edit **nama saja**, nonaktifkan dengan waktu efektif |
| Tenant | Invitation email baru, nama, properti dan expiry; tanpa edit akun/password |
| Occupancy | Tambah, akhiri, pindah kamar dalam properti sama |
| Kartu RFID | Daftar, cabut, ganti kartu; identitas kartu baru diketik tersamarkan |
| Fasilitas | Tambah dan nonaktifkan |
| Device | Tambah dan nonaktifkan |
| Aset Meter | Tambah dan pensiunkan |
| Pemasangan Meter | Tambah, pindah pemasangan, akhiri pemasangan |
| RFID Reader | Tambah dan akhiri reader |

API belum menyediakan edit umum untuk kategori selain nama kamar. UI tidak menciptakan endpoint atau memberi kesan field yang tidak didukung dapat diedit. Record simulasi tetap baca-saja. Pilihan relasi kamar/device/aset/fasilitas memakai record manual dalam properti yang sama; tenant harus memiliki membership dan akun aktif. Backend tetap memvalidasi seluruh relasi, interval, sesi terbuka dan constraint.

API tidak menyediakan daftar properti tersendiri: pilihan properti diturunkan dari record master yang dapat diakses, dengan label UUID. Properti tanpa satu pun record master belum dapat dipilih melalui UI ini. Kartu dapat memerlukan pemilihan properti membership karena respons kartu tidak memiliki property_id.

## Keamanan aksi dan retry

- Setiap aksi mengambil CSRF baru, membawa cookie sesi dan X-Account-ID, serta UUID Idempotency-Key baru. Edit/lifecycle membawa row_version yang sedang ditinjau; create tidak mengirim versi yang belum ada. Reason wajib, maksimal 500 karakter.
- Key, method, URL, body dan versi disimpan sebagai snapshot di memori form. Klik ganda dicegah. Timeout 15 detik, gangguan jaringan, HTTP 5xx, CSRF gagal dan idempotency_in_progress mempertahankan snapshot; isian dikunci dan tombol **Ulangi aksi yang sama** memakai key/body semula dengan CSRF baru. Tidak ada retry otomatis.
- stale_version meminta tutup, muat ulang dan tinjau ulang. idempotency_key_conflict meminta berhenti dan periksa daftar; tidak mengganti key otomatis. Pesan 401, 403/404, constraint dan sesi terbuka menggunakan bahasa Indonesia, tanpa menampilkan error mentah server.
- Setelah sukses, key dan isian dibuang; daftar dibaca ulang. Pada hasil tidak pasti, penutupan form meminta konfirmasi karena retry key akan hilang. Setelah reload/navigasi/logout jangan langsung membuat aksi pengganti: periksa daftar terlebih dahulu. Tidak ada penyimpanan key di localStorage, sessionStorage, URL atau log.
- Token invitation hanya ditampilkan pada hasil sukses yang masih terbuka, dalam state komponen. Tutup/Selesai/unmount/logout membuang state; tidak ada riwayat atau tombol tampilkan ulang. Retry sebelum hasil pertama diterima dapat memperoleh token yang sama dari server. Jangan menyimpan token di screenshot, log atau source control.
- Daftar/detail memakai proyeksi field eksplisit; tidak menampilkan password/hash, UID kartu mentah, payload MQTT atau token invitation lama. Source manual pada record uji adalah hasil API existing, bukan pengamatan sensor; nama dan reason memakai awalan UJI UI.
- Tenant tidak memiliki menu Administrasi dan component guard tidak memuat data admin. Sesi 401 mengikuti pembersihan AuthGate existing. Unmount membatalkan fetch dan mengabaikan hasil terlambat.

## Daftar, detail dan tampilan

Ringkasan sembilan kategori, pencarian/filter lokal, status temporal, label simulasi/manual, detail dan pagination tampilan 10/25/50 tetap tersedia. Enam daftar API diikuti sampai seluruh cursor after selesai (limit 100). Tenant/occupancy/kartu belum dipaginasi server; array dimuat utuh dan deduplikasi ID. Kegagalan halaman tidak ditampilkan sebagai daftar lengkap. Detail berasal dari respons daftar; tidak ada endpoint detail terpisah. Administrasi tidak polling otomatis.

Desktop memakai tabel dan form dua kolom; ponsel memakai kartu dan form satu kolom. Dialog native menangani fokus modal dan Escape; dialog panjang dapat digulir. Status device adalah status administrasi, bukan kesegaran MQTT. Nilai kosong tetap Tidak tersedia.

## Build lokal dan test

Dengan layanan Docker existing healthy:

```powershell
npm run build
.\scripts\docker.ps1 compose cp dist/. backend:/app/dist/
node --test web/admin-mutations.test.js web/admin-ui.test.js web/sessions-ui.test.js test/dashboard.test.js
.\scripts\docker.ps1 compose exec -T -e INTEGRATION_DB=1 backend node --test test/master-data.test.js
.\scripts\docker.ps1 compose exec -T backend node scripts/verify-rfid.js snapshot
```

Build harus selesai sebelum copy. Copy hanya memperbarui aset container berjalan; image belum dibangun ulang. Recreate dari image lama memerlukan copy ulang atau build image sesuai prosedur lokal. Tidak perlu migration/seed/reset untuk tahap ini. Peringatan ukuran bundle sekitar 629 kB masih ada.

## Hasil nyata 22–23 September 2026

- Build Vite dan git diff --check lulus. **19 test frontend lulus tanpa skip**: pagination, proyeksi aman, status, error HTTP, body API, versi, tanggal, immutable retry/key sama/CSRF baru setelah respons hilang, abort, serta regresi monitoring/RFID.
- **2 test master PostgreSQL existing lulus tanpa skip**, fixture rollback: scope, audit, stale version, move atomik, invitation replay, konflik key, replace dan request paralel. Test router tersebut tidak menggantikan uji autentikasi browser.
- Browser owner/API nyata: tambah kamar, edit nama, stale_version dua tab, nonaktif kamar/fasilitas/device, tambah fasilitas/device/aset/pemasangan/reader/kartu, move dan retire pemasangan, retire aset/reader, replace dan revoke kartu; invitation berhasil dan token tidak ada setelah ditutup. Create dan end occupancy Agustus berhasil pada kamar baru tanpa meter, tidak mengubah occupancy simulasi existing.
- Timeout browser nyata: proses backend dijeda 45 detik lalu dipulihkan otomatis. Pengambilan CSRF timeout, form tetap terkunci; retry dari form yang sama berhasil. SQL read-only membuktikan kode UI-2309-TIMEOUT hanya satu kamar, satu audit create dan satu hasil idempotensi. Ini **bukan** uji hilangnya respons sesudah commit di browser; skenario response-lost diuji helper, replay hasil terkomit diuji suite PostgreSQL.
- Masalah yang diperbaiki: presisi menit menyebabkan tanggal revoke sama dengan register; kini presisi detik dan validasi urutan waktu. Input datetime dipantau pada input/change agar nilai tidak kembali ke default. Tanggal akhir occupancy opsional tidak diisi otomatis.
- Desktop 1280×900 dan ponsel 390×844 diperiksa secara visual, termasuk dialog occupancy panjang; tidak ada overflow horizontal pada pemeriksaan DOM. Viewport dikembalikan setelah pengujian.
- Logout owner kembali ke login; tenant tidak memiliki menu/form Administrasi. Sembilan GET owner dan satu POST owner memakai sesi tenant ditolak 403; tanpa sesi ditolak 401.
- Histori sebelum/sesudah identik: sesi 4 / 45732f4a2093e38b28ffe5e0706cde6e; event 8 / 71b085ebafe2e3aad388f23b4d3f7fb3; readings 1457 / 1e58cd31a8eff1d6c0d8a434cbcbb54a; non-RFID 1450 / 3e93b4b5220142a05ef009871618f8cf. Ketiga layanan kembali healthy.

Record uji permanen dibuat melalui UI dan tidak dihapus. Sebagian besar berada di properti UJI IDEMPOTENSI (ID da7a96ec-b738-435e-a617-3a20855edda1). Kartu sintetis dan kamar/occupancy uji memakai properti demo karena tenant aktif existing berada di sana; tidak ada meter/sensor/sesi baru pada kamar occupancy. Invitation `ui-owner-2209@simulation.invalid` belum diaktifkan; token tidak disimpan. Nama record berawalan UJI UI 22 Sep atau UJI UI 23 Sep.

## Batas dan tindak lanjut

1. **Routing backend diperbaiki 24 September 2026:** guard role owner di `masterApi` hanya berjalan pada subpath `/owner`. Tenant kembali dapat memakai monitoring dan RFID sesuai occupancy, tetapi seluruh GET/POST `/api/owner` tetap menghasilkan `403 owner_required`. URL dan frontend tidak berubah; regression test mounting router serta verifier HTTP nyata tersedia.
2. Form move occupancy diperiksa di browser dan body diuji helper; sukses move diuji pada fixture PostgreSQL, **belum melalui browser**. Tenant aktif existing mempunyai interval lain; tidak mengubah interval tersebut atau mengaktifkan akun undangan untuk memaksakan fixture.
3. idempotency_in_progress, idempotency_key_conflict dan CSRF gagal diuji helper/API, belum disuntikkan pada browser. Kehilangan respons setelah commit, refresh ketika hasil belum pasti, dan semua kombinasi lifecycle/constraint belum diuji end-to-end browser.
4. Sebagian pelanggaran constraint database masih dikembalikan backend sebagai HTTP 503. Frontend konservatif menyebut hasil belum pasti dan mempertahankan key. Setelah menutup form, baca ulang daftar sebelum mengoreksi aksi. Backend tidak diubah untuk memetakan error tersebut.
5. Belum uji data master besar, halaman kedua tampilan dengan data nyata, semua browser atau screen reader. Tidak ada integrasi hardware, deployment, commit/push, reset atau penghapusan volume.
