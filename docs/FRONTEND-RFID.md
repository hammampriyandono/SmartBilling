# Frontend Riwayat Fasilitas RFID

19 September 2026. Modul React menggunakan API RFID existing. Tidak ada perubahan backend, migration, kontrak MQTT, simulator, autentikasi atau perhitungan energi pada tahap frontend ini.

## Cara mencoba

Buka http://127.0.0.1:3000, login, lalu pilih navigasi **Riwayat fasilitas RFID**. Monitoring listrik tetap dapat dibuka melalui tombol di sebelahnya. Keduanya section pada URL root; reload kembali ke monitoring. Gunakan refresh browser sekali bila tab masih menampilkan build lama.

Akun lokal: `owner@simulation.local` dan `tenant@simulation.local`. Password ada pada `.local/secrets/owner_login_password` atau `.local/secrets/tenant_login_password`; jangan memasukkan file secret ke Git.

- Owner: daftar fasilitas properti sendiri dan riwayat sesi yang diberikan API owner.
- Tenant: daftar fasilitas menurut occupancy aktif dari API; **Riwayat penggunaan saya** hanya sesi peserta sendiri. Riwayat pribadi dari occupancy lama tetap dapat muncul melalui filter **Semua sesi saya**, meski fasilitas lama tidak ada pada daftar occupancy aktif. Status fasilitas sedang digunakan tidak mengidentifikasi siapa penggunanya.
- Pilih kartu fasilitas atau dropdown untuk memfilter histori. Klik kartu yang aktif lagi untuk kembali ke semua sesi. Filter status langsung berlaku; tanggal berlaku setelah **Terapkan tanggal**.
- Rentang tanggal menggunakan WIB (Asia/Jakarta), tanggal akhir termasuk, maksimal 31 hari. **7 hari terakhir** mengembalikan rentang default.
- Sesi tampil berurutan menurut API (mulai terdahulu), 10/25/50 per halaman. **Berikutnya/Sebelumnya** memakai cursor API; halaman kembali ke awal saat filter/ukuran berubah. Tidak menyebut jumlah halaman sebagai total semua sesi.
- Polling lima detik ketika tab terlihat memperbarui daftar fasilitas dan halaman sesi saat ini. Waktu pembaruan API bukan waktu tap baru. Tombol **Perbarui data** dapat digunakan untuk mencoba kembali.
- Status: **Sedang digunakan**, **Selesai**, **Perlu ditinjau**. Energi `null` ditulis **Tidak tersedia**, disertai terjemahan alasan backend. Nilai nol yang benar tetap nol. Durasi/energi berasal dari API; browser hanya memformat nilai.

Desktop menggunakan tabel; di bawah 720 px setiap baris menjadi susunan label–nilai agar terbaca tanpa geser horizontal. UID, payload, dan identitas peserta tidak ditampilkan. Respons 401 memakai mekanisme `session-expired`/AuthGate existing; logout membuang state modul. Tidak ada tombol tap, perubahan kartu, koreksi sesi atau billing.

## Build dan pengujian frontend

Untuk layanan existing sehat, perbarui hanya aset frontend tanpa restart/backend build:

```powershell
npm run build
.\scripts\docker.ps1 compose cp dist/. backend:/app/dist/
node --test web/sessions-ui.test.js test/dashboard.test.js
```

Salinan aset tersebut berada pada container yang berjalan, bukan image. Jika container di-recreate dari image lama, jalankan kembali build/copy di atas. Dockerfile existing juga membangun frontend saat image dibangun pada pekerjaan selanjutnya; tahap ini tidak mengubah Dockerfile atau menjalankan migration/seed/simulator.

## Hasil dan batas verifikasi

- Build Vite lulus. Peringatan ukuran bundle sekitar 602 kB tetap ada; belum dilakukan pemisahan bundle.
- Tujuh pengujian frontend lulus (tanpa skip): batas tanggal WIB, pagination fasilitas/loop cursor/error, null/zero, alasan aman, event HTTP 401, serta regresi helper grafik/histori dashboard.
- Browser nyata dengan akun tenant existing dan login owner: dua fasilitas dan empat sesi dari database yang sudah ada; dua sesi memiliki energi, dua **Tidak tersedia** dengan alasan boundary hilang. Tidak menggunakan mock untuk tampilan.
- Filter review menghasilkan daftar kosong; filter tanggal 19 September menghasilkan satu sesi `120,026 detik` / `0,025004416 kWh`. Logout tenant kembali ke login dan tampilan owner dimuat setelah login tanpa state filter tenant.
- Tata letak diperiksa pada viewport desktop 1280×900 dan ponsel 390×844, termasuk susunan sesi/null pada ponsel. Tidak ada UID/payload/identitas tenant lain di tampilan.
- Dataset existing hanya empat sesi, semua selesai: belum ada bukti browser untuk baris sesi aktif/review atau perpindahan halaman sesi kedua dengan data nyata. Label/fallback sudah tersedia; pagination fasilitas/error/401 diuji melalui unit helper, bukan gangguan layanan nyata. Tidak membuat fixture database atau menjalankan simulator demi pengujian frontend ini.
- Kedua akun demo memang berhak atas empat sesi yang sama (owner properti dan tenant peserta). Uji isolasi akun lain pada database berada pada suite backend yang telah tercatat di HANDOFF; tidak mengklaim mengulang uji backend pada tahap ini.
