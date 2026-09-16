# Rencana autentikasi lokal owner/tenant

Status: **usulan, menunggu persetujuan pengguna**. Audit 15 September 2026. Dokumen ini tidak mengaktifkan autentikasi atau menyetujui asumsi ERD. Belum ada dependency, migration SQL, perubahan API/UI, akun atau hak akses yang diterapkan pada tahap audit.

## Temuan repository

- Git bersih saat audit dimulai; implementasi simulator sebelumnya sudah menjadi kondisi existing. Stack Express 5/pg/React dan layanan lokal dipertahankan.
- Audit PostgreSQL baca saja mengonfirmasi migration 001–003 terpasang, satu akun owner nonaktif, belum ada tenant, occupancies atau auth_sessions. Ketiga layanan Docker healthy. Tidak menjalankan simulator, seed, migration atau build pada audit ini.
- Migration 001 sudah memiliki users (email lowercase unik, password_hash, role owner/tenant, is_active) dan properties.owner_id, dengan validasi peran owner. Migration 002/003 terkait penolakan MQTT/checkpoint simulator.
- ERD memiliki occupancies dengan user_id, room_id, starts_at, ends_at, created_at. Tabel ini belum terdapat dalam migration aplikasi. Panduan ERD menyebut banyak penghuni per kamar dan satu kamar per pengguna pada satu waktu; aturan kardinalitas tersebut masih usulan untuk tahap ini, bukan persetujuan produk baru.
- Seed owner simulasi sengaja nonaktif, dengan password acak yang tidak disimpan; bukan akun login yang bisa dipakai. Tidak ada flow login, session store, middleware autentikasi, atau library autentikasi pada package.json.
- monitoring-api.js memakai authenticated:false. rooms/meters tidak difilter pengguna; router.param hanya memeriksa meter ada. latest, readings, dan daily dapat membaca meter mana pun melalui ID. Parameter property_id bukan bukti hak akses.
- Daily mengambil satu sampel sebelum rentang dan sampel batas akhir inklusif. Pembatasan tenant harus diterapkan sebelum perhitungan; menyaring JSON hasil saja dapat membocorkan konsumsi di luar masa tinggal.
- Dashboard mengambil data same-origin, memuat semua halaman, polling health/latest lima detik. Error 401 belum punya perilaku khusus; cache state pembacaan lama dipertahankan saat error. Pada implementasi auth nanti, logout/401/pergantian akun wajib membatalkan request dan mengosongkan semua state akun lama.
- Ingest MQTT tidak bergantung pada browser; pembatasan HTTP dapat ditambahkan tanpa mengubah kontrak MQTT, data sensor, simulator atau rumus energi inti. Dashboard tetap mengonsumsi bentuk data monitoring yang sama.

## Satu rekomendasi metode

Login email/password dengan sesi server-side di PostgreSQL, cookie ID sesi HttpOnly; gunakan express-session dan connect-pg-simple dengan pool pg existing. Hash password memakai scrypt asinkron bawaan Node.js, salt acak per password, format hash berversi yang menyimpan parameter, dan pembandingan timing-safe. Tidak memerlukan layanan eksternal atau ORM.

Usulan konfigurasi keamanan yang ikut menunggu persetujuan:

- Cookie host-only (tanpa Domain), Path=/, HttpOnly, SameSite=Lax; HTTP loopback lokal memakai Secure=false secara eksplisit. Ini tidak menetapkan konfigurasi produksi; HTTPS/Secure wajib dirancang sebelum publikasi.
- Sesi maksimal delapan jam absolut; polling tidak memperpanjang batas tersebut. Simpan issued_at/expires_at dan periksa di server; nonaktifkan touch yang memperpanjang TTL. Regenerasi ID sesi setelah login, hapus sesi server dan cookie saat logout. Session secret acak persisten dalam file lokal terabaikan Git; tidak di frontend/log/contoh source.
- Session hanya menyimpan identitas akun dan metadata sesi, bukan salinan hak akses permanen. Periksa users.is_active/role dan kepemilikan/occupancy pada setiap request. DB/session store gagal: tolak akses dengan 503, jangan fallback menjadi anonim yang dapat melihat data.
- JSON body dibatasi; token CSRF terikat sesi dan pemeriksaan Origin untuk POST termasuk login/logout. Token tersedia dari endpoint CSRF same-origin. Respons auth/data memakai Cache-Control:no-store. Tidak menambahkan CORS atau membuka port.
- Pembatasan percobaan login per IP dan identitas email ternormalisasi, respons generik untuk email tidak ada/password salah/akun nonaktif, dummy hash check, tidak mencatat password/cookie/token. Default usulan 5 kegagalan per akun dan 30 per IP per 15 menit, konfigurabel. Untuk proses lokal tunggal limiter memori terbatas memadai; restart mengosongkan limiter, bukan janji proteksi produksi. Parameter scrypt mengikuti panduan OWASP (misalnya N=2^17,r=8,p=1), dengan batas konkurensi/memori serta pengukuran dalam Docker sebelum dipakai.
- Tidak ada registrasi publik, lupa password via email, remember-me, atau UI admin lengkap pada tahap ini. Provisioning akun/masa tinggal melalui CLI lokal eksplisit yang tervalidasi dan terdokumentasi.

Referensi primer: [Express session](https://expressjs.com/en/resources/middleware/session/), [PostgreSQL session store](https://github.com/voxpelli/node-connect-pg-simple), [Node crypto](https://nodejs.org/api/crypto.html), [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html). Versi dependency baru akan diperiksa/dikunci setelah persetujuan; belum dipasang.

## Usulan aturan otorisasi

| Akses | Owner | Tenant |
|---|---|---|
| Daftar kamar/meter | Hanya properti dengan owner_id dirinya, termasuk utama/komunal | Kamar yang pernah/sedang ditempatinya dan meter kamar dengan pemasangan beririsan masa tinggal |
| Latest | Terbaru pada meter berhak | Terbaru hanya dalam gabungan masa tinggal yang sudah dimulai; mantan penghuni dapat membaca sampel historis terakhirnya, tetap berlabel lama |
| Histori | Meter berhak, batas/pagination existing | Irisan rentang permintaan, masa tinggal [starts_at,ends_at), dan pemasangan meter |
| Daily | Aturan konservatif existing | Hanya interval dalam haknya; total penuh hanya jika seluruh hari dan kedua sampel batas berhak, selain itu parsial/null |
| Meter utama/komunal | Miliknya | Tidak tersedia pada tahap ini |

- Akun aktif wajib; tanpa sesi 401. Meter tidak ada dan meter di luar hak sama-sama 404. Daftar difilter di SQL sebelum limit/pagination; cursor dan property_id tidak dapat melewati scope.
- Tidak mengungkap nama/email tenant lain. Metadata perangkat/properti dibatasi pada kebutuhan monitoring pengguna berhak.
- Usulan occupancy: banyak tenant boleh satu kamar, tetapi satu tenant tidak memiliki masa tinggal tumpang tindih di kamar mana pun. Ini menerjemahkan panduan ERD dan perlu persetujuan sebagai bagian rencana, bukan diasumsikan sudah berlaku.
- Tenant tetap dapat mengakses masa tinggal yang sudah selesai; masa tinggal masa depan belum memberi akses. Query harus mendukung beberapa kunjungan terpisah pada kamar yang sama tanpa menghubungkan delta energi melintasi jeda tidak berhak.
- Sampel tepat ends_at tidak boleh diberikan ke tenant lama, termasuk sebagai bahan perhitungan daily. Konsekuensi konservatif: hari terakhir dapat parsial walaupun owner melihat hari lengkap. Sampel sebelum awal masa tinggal tidak dipakai sebagai konteks reset tenant. Akses ditentukan measured_at, bukan received_at.
- Hari tanpa irisan hak tidak dikembalikan sebagai informasi meter; rentang campuran hanya menghasilkan hari yang beririsan hak dengan metadata cakupan akses. Hari parsial tidak diubah menjadi hari pendek yang tampak lengkap. Agregasi beberapa segmen menjumlahkan hanya subtotal interval sah, tanpa membuat pasangan delta antarsegmen; fungsi kualitas inti tetap digunakan per segmen.

## Rencana migrasi dan provisioning (belum dijalankan)

1. Audit baca saja constraint, jumlah akun/mapping, migration terpasang dan fingerprint seluruh sensor/checkpoint sebelum perubahan. Jangan edit migration 001–003 yang sudah memiliki checksum.
2. Migration baru 004: occupancies dengan UUID PK, FK RESTRICT ke users/rooms, waktu finite, ends_at > starts_at bila ada; index user/room+waktu; exclusion gist(user_id =, tstzrange &&) untuk usulan satu kamar per tenant. Validasi role tenant dan rentang berada dalam masa aktif kamar; lindungi juga perubahan role/masa aktif parent yang dapat merusak relasi. Gunakan transaksi/locking yang teruji untuk kasus konkurensi.
3. Migration baru 005: auth_sessions sesuai skema store terpilih (sid, sess JSON, expire dan index expiry), dibuat lewat migration, bukan createTableIfMissing saat startup. Tidak menyentuh meter_readings, MQTT rejection, atau checkpoint. Pembersihan hanya sesi kedaluwarsa, tidak data histori.
4. CLI provisioning terpisah dari seed:demo. Untuk memakai data simulator existing, usulkan aktivasi owner demo yang saat ini nonaktif dengan password lokal yang pengguna masukkan lewat prompt tersembunyi, plus akun tenant demo baru dan occupancy contoh eksplisit. Aktivasi/hash owner adalah perubahan akun yang hanya dilakukan setelah rencana disetujui dan CLI dipanggil eksplisit; tidak mengganti owner_id properti/mapping sensor. Rerun tidak menimpa password/occupancy existing diam-diam. Kredensial tidak disimpan di Git atau dicetak pada log.
5. Pengujian hak akses memakai fixture owner A/B, tenant A/B, kamar dan masa tinggal sebelum/sesudah batas. Fixture terisolasi dari data simulator; tidak menambah pembacaan ke meter simulator existing. Jangan menjalankan seed awal ulang.
6. Setelah persetujuan, implementasikan middleware/session + scope query, baru integrasi layar login/logout dan 401 pada React dengan layout/rumus/polling existing dipertahankan. Tahap audit ini hanya mengubah dokumen.

## Daftar endpoint yang direncanakan

| Endpoint | Perilaku |
|---|---|
| GET /api/auth/csrf | Token CSRF sesi anonim atau sesi login; no-store |
| POST /api/auth/login | Email/password + CSRF; rotasi sesi; 200 identitas minimum, 401 generik, 429 throttling |
| GET /api/auth/me | 200 id/name/role akun aktif; 401 jika tidak login/kedaluwarsa |
| POST /api/auth/logout | CSRF; invalidasi sesi dan cookie; 204 |
| GET /api/rooms | Bentuk/pagination existing; scope pengguna |
| GET /api/meters | Bentuk/pagination existing; scope pengguna dan masa pemasangan |
| GET /api/meters/:id/latest | Pembacaan terakhir yang berhak atau null |
| GET /api/meters/:id/readings | Scope waktu dan semua pagination; tidak ada sampel di luar hak |
| GET /api/meters/:id/daily | Batas hak sebelum hitungan, metadata cakupan dan kualitas |
| GET /health/live, /health/ready | Tetap probe lokal tanpa login; tidak mengungkap pengguna/credential; ingest independen |

Tidak menambah endpoint CRUD akun/occupancy publik pada tahap minimum. meta.authenticated yang sekarang false menjadi sesuai sesi; label simulasi tidak berubah menjadi hardware.

## Kriteria uji setelah persetujuan

1. Login benar/salah/akun nonaktif/email tidak ada, CSRF hilang/salah dan Origin asing; throttling; tidak bocor credential/hash dalam respons/log. Password hash berversi diverifikasi, hash seed lama tidak dianggap kredensial valid otomatis.
2. Cookie flags, ID sesi berubah saat login (session fixation), logout menonaktifkan cookie lama; sesi bertahan restart backend dengan secret sama, kedaluwarsa absolut meskipun polling, akun dinonaktifkan langsung kehilangan akses. DB gagal tidak membuka akses.
3. Owner A tidak melihat properti B lewat daftar, filter property_id, ID langsung, latest, histori, daily, atau cursor yang dimodifikasi. Tenant A tidak melihat kamar B atau tenant lain.
4. Timestamp tepat starts_at boleh, tepat ends_at tidak; future occupancy tidak memberi akses; mantan tenant hanya histori masanya; pindah kamar, meter berganti, beberapa occupancy terpisah, sampel tiba terlambat. Tidak ada delta melintasi masa tanpa hak.
5. Daily tidak membaca sampel konteks/batas di luar hak; hari pindah parsial, total null; gap/reset/null tetap sesuai aturan; hari tidak berhak tidak membocorkan sample_count/status. Owner tetap memperoleh hasil existing yang sama.
6. Constraint occupancy menolak overlap/role salah/waktu invalid, mendukung penghuni berbeda dalam kamar sama sesuai persetujuan; perubahan parent dan insert bersamaan tidak melanggar invariants. Migration rerun aman tanpa reset.
7. Browser owner/tenant nyata: login, daftar terfilter, histori seluruh halaman, polling lima detik, logout/login akun lain tanpa data tertinggal atau response lama masuk lagi; 401 menghapus data akun lama, 503 bukan logout palsu.
8. Simulator→MQTT→DB tetap berjalan tanpa sesi web; dashboard pengguna berhak diperbarui. Bandingkan fingerprint sensor/checkpoint sebelum/sesudah perubahan auth tanpa menjalankan simulator saat pembandingan. Jalankan suite PostgreSQL nyata tanpa skip dan build Docker setelah kode berubah.

## Keputusan yang diminta

Setujui paket sesi PostgreSQL + cookie HttpOnly/scrypt, aturan akses temporal dan kardinalitas occupancy di atas, serta provisioning lokal eksplisit (termasuk aktivasi owner demo untuk memakai dataset existing). Konsekuensi: dashboard/API monitoring nanti memerlukan login; tenant hanya melihat masa tinggalnya, total hari batas dapat parsial, dan ada dua dependency session tambahan. Aplikasi, broker dan jaringan tidak berubah selama menunggu jawaban.
