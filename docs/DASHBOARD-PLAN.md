# Rencana dashboard monitoring lokal

Status 14 September 2026: pengguna menyetujui stack dan polling di bawah; implementasi tersedia pada web/. Perubahan ingest existing dipertahankan. Hasil pengujian nyata dicatat di HANDOFF setelah verifikasi.

## Keputusan yang disetujui

React + Vite, JavaScript, Recharts dan CSS biasa. Hasil build statis disajikan oleh Express existing pada localhost:3000 bersama API. Ini menambah dependency/build frontend tanpa membuka layanan baru ke LAN. Vite mendukung template React JavaScript serta output statis; Recharts menyediakan komponen grafik React. Rujukan: https://vite.dev/guide/ dan https://recharts.github.io/en-US/.

Polling health dan latest setiap 5 detik, tanpa permintaan tumpang tindih. Batalkan permintaan usang saat pilihan meter/rentang berubah. Refresh histori/harian setelah pembacaan berubah; sediakan refresh manual untuk memuat ulang data terlambat yang tidak mengubah latest. Tunda polling saat tab tersembunyi dan jalankan kembali saat tab aktif. Disetujui pengguna pada 14 September 2026.

## Kebutuhan satu halaman responsif

1. Header SmartBilling dengan label permanen Data simulasi / Pengembangan lokal; status backend terpisah dari waktu ukur sensor dan waktu sukses refresh browser.
2. Daftar kamar dan meter; gabungkan room_id ke nama/kode kamar. Meter utama/komunal diberi jenis, channel dan ID singkat karena API belum menyediakan nama perangkat/fasilitas. Ambil semua halaman daftar melalui next_after.
3. Pilihan meter mengendalikan seluruh panel. Kartu latest: V, A, W, energi kumulatif kWh, measured_at dan received_at. Nilai null ditampilkan Tidak tersedia, tidak dikonversi ke nol. Latest null berarti Belum ada pembacaan.
4. Grafik histori daya W terhadap waktu; filter tanggal inklusif untuk pengguna, preset tujuh hari dan akses eksplisit ke tanggal dataset simulasi 12 September. Default tujuh hari berarti tujuh tanggal kalender sampai hari ini pada zona bangunan, bukan klaim tersedia tujuh hari data. Tampilkan rentang sumbu penuh dan celah/null tanpa garis interpolasi lintas gap.
5. Tabel konsumsi harian: tanggal, total kWh, subtotal interval valid, status Lengkap/Parsial/Tanpa data, cakupan dan alasan. Semua hitungan energi berasal dari daily API. Counter kumulatif tidak digunakan sebagai konsumsi harian.
6. Loading awal, progres jumlah sampel/halaman, error dengan Coba lagi, kosong, dan kegagalan refresh yang mempertahankan data terakhir dengan penanda usang. Panel tidak boleh memperlihatkan data meter lama seolah milik pilihan baru.

## Audit API dan penanganan data

- GET /api/rooms dan /api/meters: pagination next_after; limit maksimal 1000. Label dapat dibentuk dari data existing tanpa endpoint baru.
- GET /api/meters/:id/latest: data atau null; numeric berupa string. Simpan string asli untuk kartu/tooltip; konversi ke number hanya untuk koordinat grafik dengan pemeriksaan null terlebih dahulu.
- GET /api/meters/:id/daily: tanggal akhir eksklusif; metadata timezone dan max_gap_seconds serta starts_at/ends_at setiap hari tersedia. Gunakan batas waktu yang dikembalikan server untuk query histori agar tanggal konsisten dengan zona bangunan tanpa menebak zona browser. Batas UI maksimal 31 hari; tangani HTTP 422 dengan anjuran memperpendek rentang.
- GET /api/meters/:id/readings: ambil limit 1000 dan lanjutkan next_cursor sampai null; urutan measured_at/id. Jangan menampilkan halaman pertama sebagai grafik lengkap. Bila halaman berikutnya gagal, tandai histori belum lengkap. Tujuh hari sampling 60 detik membutuhkan sekitar 11 halaman. Batas akhir histori eksklusif; pembacaan tepat akhir hari dipakai oleh daily tetapi bukan bagian tanggal tersebut pada grafik mentah.
- Pagination bukan snapshot lintas request: data terlambat dapat memerlukan reload penuh. Jangan menganggap polling latest mendeteksi seluruh data terlambat.
- GET /health/ready: database, mqtt, ingest dan status; ini status layanan, bukan bukti sensor mengirim sekarang. Tampilkan usia pembacaan measured_at secara eksplisit. Dataset 12 September harus tetap bertanggal lama walau refresh API baru berhasil; hindari label Sensor live.

## Verifikasi setelah persetujuan

- Build Docker dan regresi backend/PostgreSQL existing, lalu browser desktop dan layar kecil dengan API nyata.
- Meter kamar demo: data latest, histori lintas halaman, hari 12 September complete 1.44 kWh; meter tanpa sampel: kondisi kosong. Rentang tanpa data tidak menjadi nol.
- Pilihan tujuh hari, ganti meter cepat, polling gagal/pulih, null/gap dan waktu ukur lama; bedakan skenario fixture terkontrol dari data asli API bila diperlukan untuk kasus yang tidak ada pada dataset.
- Simulator berkala belum diperlukan untuk audit. Jika ditambahkan untuk demo refresh, gunakan mapping meter/device serta boot/epoch simulasi terpisah; jangan menambah counter berbeda ke meter dataset deterministik existing.

## Kondisi pemeriksaan sekarang

Permintaan host ke health, rooms, meters dan latest pada 14 September ditolak koneksinya di localhost:3000. Audit di atas bersumber dari kode dan dokumen; belum merupakan verifikasi API runtime atau tampilan browser pada tahap dashboard.
