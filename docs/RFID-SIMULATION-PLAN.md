# Sesi fasilitas RFID — kontrak simulasi v1

17 September 2026. **Disetujui pengguna dan diimplementasikan untuk pengembangan lokal.** Migration 006–007, ingest, simulator, API dan halaman owner tersedia. Bagian audit di bawah mencatat kondisi sebelum implementasi; hasil nyata terbaru ada di HANDOFF. Kontrak ini untuk simulator lokal, bukan kontrak final ESP32 atau keputusan hardware.

## Audit kondisi terbaru

- HEAD `3a96d44` (docs: document owner tenant authentication workflow); working tree bersih sebelum audit. Implementasi autentikasi, provisioning, middleware owner/tenant dan React sudah ada di commit existing dan dipertahankan.
- Sebagian dokumentasi tertinggal: AUTH-PLAN masih bertuliskan menunggu persetujuan dan HANDOFF terakhir masih audit autentikasi. Pernyataan pengguna terbaru dan implementasi menjadi acuan; autentikasi tidak dikerjakan ulang.
- Migration tersedia 001 monitoring, 002 penolakan MQTT, 003 checkpoint simulator, 004 occupancies, 005 auth_sessions. Belum ada rfid_cards, device_events, usage_sessions atau session_participants pada migration.
- ERD menyediakan keempat tabel tersebut. device_events unik (device_id, boot_id, sequence_no); usage_sessions menunjuk meter, event awal/akhir dan pembacaan batas; participants menghubungkan kartu dengan occupancy. ERD juga memuat alokasi equal_registered dan multi-peserta yang **tidak otomatis menjadi kebijakan tahap ini**.
- Seed source mendefinisikan fasilitas attributable Fasilitas SIMULASI (ID berakhir 0007), meter komunal 0008 pada sim-device-01 channel 2. Simulator deterministik mengisi meter kamar 0005, simulator berkala memakai meter kamar 0105. Tidak ada provisioning kartu/pembaca RFID atau generator event tap.
- Middleware HTTP sudah memeriksa akun aktif, sesi, properti owner dan masa tinggal tenant. Tenant saat ini tidak berhak membaca meter utama/komunal. Endpoint sesi harus memiliki scope peserta sendiri; jangan membuka API telemetry komunal bagi tenant sebagai jalan pintas.
- Subscriber saat ini hanya menerima readings dan probe. sensorPrefix mencakup namespace devices, sehingga penambahan RFID memerlukan dispatch berdasarkan topik lengkap sebelum memanggil validator sensor; jangan membiarkan tap masuk validator listrik. Kontrak listrik tidak diubah.
- Pada audit ini Docker Engine tidak tersedia (pipe dockerDesktopLinuxEngine tidak ditemukan). Query mapping/count database langsung gagal terhubung, bukan membuktikan data hilang. Tidak menjalankan startup, recovery, migration, seed, simulator atau pengujian integrasi. Data/mapping di atas bersumber kode; jumlah dan fingerprint live harus diperiksa sebelum implementasi.

## Keputusan produk yang sudah berlaku

Tap valid pertama membuka sesi; tap berikutnya kartu sama pada fasilitas sama menutup sesi. Tidak ada penutupan timer, daya, atau relay. Seluruh hitungan di backend; billing dan integrasi perangkat nyata belum masuk tahap ini. Sesi web express-session berbeda dengan usage_sessions penggunaan fasilitas.

## Kontrak MQTT yang disetujui

Topik: `smartbilling/sim/v1/devices/{device_uid}/rfid/taps`

QoS 1, retain=false. Contoh perangkat simulator baru: sim-rfid-01. Payload JSON UTF-8 maksimal 4096 byte, schema ketat, field asing ditolak.

Tap pertama pada stream baru:

```json
{
  "schema_version": 1,
  "boot_id": "a0500000-0000-4000-8000-000000000301",
  "sequence_no": 0,
  "previous_event": null,
  "reader_channel": 0,
  "card_uid": "A0500001",
  "occurred_at": "2026-09-17T10:00:00.000+07:00"
}
```

Tap kedua (menutup bila tap pertama diterima dan sesi tersebut masih aktif):

```json
{
  "schema_version": 1,
  "boot_id": "a0500000-0000-4000-8000-000000000301",
  "sequence_no": 1,
  "previous_event": {
    "boot_id": "a0500000-0000-4000-8000-000000000301",
    "sequence_no": 0
  },
  "reader_channel": 0,
  "card_uid": "A0500001",
  "occurred_at": "2026-09-17T10:02:00.000+07:00"
}
```

- Identitas stabil: device dari topik + boot UUID + sequence integer nonnegatif safe-integer. Sequence khusus stream RFID per device, melintasi semua reader_channel; tidak berbagi urutan dengan readings. UUID boot baru tiap proses, sequence dimulai 0. Retry memakai identitas dan isi yang sama, termasuk waktu kejadian.
- previous_event menunjuk event RFID sebelumnya pada device yang sama, termasuk lintas restart. Ini memungkinkan backend menahan event yang pendahulunya belum diterima, sehingga pesan terlambat atau gap tidak diam-diam menukar arti buka/tutup. Dalam boot sama sequence harus bertambah satu; boot baru seq=0 tetap merujuk event terakhir boot sebelumnya. null hanya untuk event pertama stream terprovisioning yang masih kosong. Checkpoint hilang tidak boleh dianggap stream baru.
- occurred_at wajib ISO 8601 dengan zona, presisi maksimal milidetik. received_at dibuat backend dan tidak menggantikan waktu tap. Waktu mundur/ambigu pada fasilitas yang sama tidak men-toggle sesi; ditandai review. Simulator tidak mengirim masa depan; nilai masa depan ditahan/ditolak untuk review, tidak dijadikan sesi aktif otomatis.
- reader_channel integer nonnegatif mengacu mapping reader→fasilitas yang berlaku pada waktu event. Backend menentukan meter komunal terpasang; payload tidak boleh menentukan user_id, property_id, session_id, open/close, nominal atau counter energi.
- card_uid canonical huruf heksadesimal kapital, panjang 8/14/20 karakter (4/7/10 byte), tanpa pemisah. UID contoh sepenuhnya sintetis. Ini format simulasi, belum menetapkan reader hardware. Jangan mencetak UID mentah di log atau API histori; tampilkan label kartu yang aman. UID kartu bukan autentikasi kriptografis perangkat.
- Konsumsi energi memakai readings kontrak listrik existing pada meter terkait. Tidak menambahkan field energi pada tap dan tidak mempercayai hitungan dari publisher.

### Deduplikasi, urutan dan crash

Inbox menyimpan identitas, payload canonical/hash, occurred_at, received_at, hasil/reason dan predecessor. Identitas sama+isi sama mengembalikan hasil awal tanpa toggle; isi berbeda dicatat konflik tanpa menimpa event/sesi lama. Event valid yang gagal aturan produk (misalnya kartu tidak dikenal/fasilitas sibuk) tetap dikonsumsi sebagai event ditolak, agar tap valid berikutnya tidak macet. Pesan struktural rusak tidak boleh mengklaim identitas/predecessor yang terpercaya.

Pendahulu belum ada → waiting_predecessor, bukan aksi sesi. Pendahulu datang → proses ulang berurutan. Dua cabang untuk predecessor sama, self-reference, sequence tidak konsisten, atau clock mundur → review/ditolak; jangan menebak urutan atau melakukan toggle retroaktif. Stream bermasalah tidak otomatis direset oleh timeout. Data valid disimpan dahulu; proses inbox dan state sesi menggunakan transaksi/lock. Inbox pending dilanjutkan setelah restart tanpa memerlukan publish baru. PUBACK saja bukan bukti perubahan sesi; simulator memeriksa hasil inbox/DB.

## Aturan minimum yang disetujui

1. Satu peserta dan paling banyak satu sesi terbuka per fasilitas attributable. Tap kartu berbeda ketika fasilitas sibuk ditolak; tidak menutup atau bergabung ke sesi orang lain. Multi-peserta/fairness tidak diimplementasikan.
2. Kartu harus terdaftar dan berlaku [registered_at,revoked_at), pengguna tenant aktif, occupancy berlaku pada occurred_at serta bangunannya sama dengan fasilitas. Perangkat/fasilitas/mapping juga harus aktif dan sah. Kartu/device asing tidak didaftarkan otomatis.
3. Tap penutup harus kartu/assignment yang sama, fasilitas sama, waktu lebih akhir, dan tetap sah dalam occupancy sesi. Kartu dicabut, tenant nonaktif/pindah, atau meter berganti ketika sesi masih terbuka menghasilkan alasan review dan mempertahankan sesi terbuka; tidak ditutup otomatis. Tahap ini belum menyediakan tombol koreksi/tutup paksa owner.
4. Dua tap fisik berbeda tetap dua event berbeda. Simulator mengirim satu event per aksi eksplisit, bukan loop pembacaan kartu yang masih ditempel. Tidak menerapkan jendela debounce berbasis waktu yang diam-diam membatalkan tap kedua; mekanisme card-present/card-removed hardware akan dibahas dengan tim elektro.
5. Status penggunaan dipisahkan dari kualitas energi: sesi bisa selesai karena tap walaupun energy_kwh=null. Simpan ended_at dan alasan energi tidak tersedia; sesi terbuka yang perlu review tetap mengunci fasilitas (constraint berdasarkan ended_at IS NULL, bukan hanya status='active').
6. Usulan konservatif energi: hanya hitung delta jika terdapat tepat satu pembacaan valid pada masing-masing waktu tap, meter/counter_epoch sama, counter tidak turun, dan rangkaian di antaranya tidak invalid/ambigu/reset/gap >120 detik (default simulasi existing). Tidak ada interpolasi atau pemilihan sampel lama seolah tepat batas. Tanpa bukti lengkap, energy_kwh=null, bukan nol. Pembacaan sensor terlambat dapat memicu rekonsiliasi ulang tanpa mengubah waktu/status buka-tutup. Tidak ada tarif, pembagian biaya atau nilai tagihan pada tahap ini.

## Rancangan migration (diterapkan sebagai 006–007)

Nomor berikutnya dipastikan lagi saat implementasi; migration 001–005 tidak diubah.

| Bagian | Rencana integritas |
|---|---|
| rfid_cards | FK pengguna RESTRICT, UID canonical, rentang registrasi valid, larangan assignment UID tumpang tindih, user_id assignment immutable; revokasi tidak memindahkan histori |
| rfid_readers | Mapping temporal device+reader_channel→communal_load, bangunan sama; rentang tidak overlap; riwayat mapping tidak ditimpa |
| device_events | Identitas device/boot/seq unik, predecessor terikat device, payload terbatas/hash, status inbox/reason/result; konflik tidak menimpa event canonical. Pesan device asing/JSON rusak dicatat via tabel penolakan berbasis hash tanpa FK device palsu |
| rfid_stream_state | Head event terproses per device, lock untuk urutan; update atomik dengan inbox/hasil sesi |
| usage_sessions | FK meter/event/readings RESTRICT; timestamp konsisten; awal/akhir event tidak dipakai ulang sebagai aksi lain; satu sesi ended_at=null per fasilitas; pembacaan harus meter sama dan waktu batas sesuai |
| session_participants | FK occupancy/card/event; satu peserta per sesi pada v1; identitas kartu/pengguna/occupancy/properti konsisten; histori assignment tidak dipindah |
| dev_checks RFID | Checkpoint/outbox simulator terpisah untuk payload pending, predecessor lintas boot dan counter fixture jika diperlukan; jangan menulis checkpoint simulator berkala existing |

Penyesuaian terhadap ERD dijelaskan eksplisit: tambahkan mapping reader dan chain predecessor, pisahkan kualitas energi dari lifecycle sesi, turunkan device_session_key dari identitas event pembuka di backend, jangan meminta perangkat menetapkan sesi. Kolom allocation_method/weight rancangan billing belum dipakai untuk menghitung pembagian; tidak mengaktifkan equal_registered sebagai keputusan fairness. Constraint cross-table dan update parent harus diuji dengan konkurensi nyata, bukan dianggap otomatis terjamin DBML.

## API dan hak akses yang direncanakan

Semua endpoint memakai middleware sesi existing, no-store, batas/pagination dan validasi input. Tidak membuat HTTP endpoint tap yang melewati MQTT atau POST penutupan manual.

| Endpoint | Owner | Tenant |
|---|---|---|
| GET /api/facilities | Fasilitas propertinya, status tersedia/sibuk/review | Fasilitas pada bangunan occupancy aktif, hanya ketersediaan tanpa identitas pengguna lain |
| GET /api/usage-sessions?facility_id=&from=&to=&status=&cursor=&limit= | Sesi fasilitas miliknya | Hanya sesi dengan participant miliknya |
| GET /api/usage-sessions/:id | Detail sesi fasilitas miliknya | Detail sesi miliknya, tanpa UID mentah/event payload atau identitas penghuni lain |

Untuk histori: from/to timestamp berzona, rentang maksimum 31 hari, irisan sesi dengan [from,to), cursor stabil (started_at,id), limit default 50 maksimum 100. Filter scope dilakukan sebelum pagination; UUID langsung tidak melewati hak akses. Tanpa login 401; resource asing/tidak ada 404. Owner A tidak membaca properti B. Tenant tidak memperoleh akses telemetry meter komunal dari endpoint monitoring existing.

Histori tenant yang occupancy-nya selesai tetap dapat menampilkan sesi yang diikutinya, berdasarkan identitas peserta tersimpan. Bila sesi menggantung melewati akhir occupancy, tenant hanya mendapat informasi sesi miliknya dan alasan review, bukan data energi/event setelah batas haknya. Tidak boleh menyimpulkan bahwa occupancy saat ini membuka seluruh histori fasilitas.

Respons sesi: ID fasilitas/meter, label simulasi, status penggunaan, waktu tap mulai/akhir, durasi backend (null sampai selesai), status/reason energi, energy_kwh nullable, serta label peserta hanya bagi owner berhak atau dirinya sendiri. Jangan mengembalikan password, card UID mentah atau payload inbox.

UI tahap pertama setelah persetujuan: halaman/section riwayat fasilitas untuk owner, filter fasilitas/rentang/status, sesi terbuka/selesai/review, loading/error/kosong dan label simulasi. Tidak menulis ulang dashboard monitoring. Endpoint tenant diuji meski tampilan histori tenant penuh dapat ditunda; tidak ada manajemen kartu/billing penuh.

## Simulator dan data pengujian

- Provisioning eksplisit/idempoten menambah device sim-rfid-01, fasilitas baru Fasilitas RFID — Simulasi, meter komunal baru, reader channel 0, kartu sintetis untuk tenant demo yang sudah memiliki occupancy sah. Tidak mengubah fasilitas/meter/pembacaan/checkpoint existing. Jika akun/occupancy belum siap, gagal dengan petunjuk, bukan mengaktifkan akun diam-diam.
- Aksi tap eksplisit dan demo dua tap terbatas, tidak berjalan saat startup. Outbox disimpan sebelum publish; restart menggunakan boot baru untuk tap baru, tetapi mengulang payload pending lama secara identik. previous_event tetap menunjuk event sebelumnya lintas restart. Eksekusi ganda ditolak dengan lock.
- Mode demo energi terpisah mengirim readings kontrak listrik existing ke **meter baru**, interval 60 detik, dengan tap pada timestamp batas yang sama. Seluruh penulisan sensor melalui MQTT; tidak menulis ulang dataset 12 September atau Simulasi berjalan. Skenario tanpa readings harus tetap membentuk sesi dan energy=null.
- Identitas run dan semua data diberi label SIMULASI; default demo dua tap dengan durasi 120 detik dan selesai. Stop di tengah meninggalkan sesi terbuka sampai tap berikutnya, bukan auto-close. CLI menampilkan hasil inbox/sesi tanpa UID mentah.
- Sebelum/sesudah pengujian bandingkan fingerprint seluruh data/mapping/checkpoint existing yang telah dicatat; data baru fixture dihitung terpisah. Jangan menjalankan seed awal, reset atau penghapusan volume.

## Skenario penerimaan setelah persetujuan

1. Tap pertama membuka, tap kedua kartu/fasilitas sama menutup tepat satu sesi; waktu dan peserta benar. Tap ketiga membuka sesi baru.
2. Replay sebelum/sesudah restart tidak men-toggle; konflik identitas tidak mengubah sesi atau event canonical. Dua consumer/request bersamaan tidak membuka dua sesi.
3. Tap datang tidak berurutan/pendahulu hilang ditahan; predecessor kemudian datang melanjutkan tepat sekali. Uji lintas boot, cabang chain, clock mundur, timestamp sama, retained/QoS salah/JSON rusak/oversize.
4. Kartu/device/reader asing, revokasi, akun nonaktif, occupancy sebelum mulai/tepat berakhir, beda properti, fasilitas shared/nonaktif, meter berubah dan kartu lain saat sibuk tidak mengubah sesi yang sah.
5. Crash setelah inbox tersimpan/sebelum sesi commit dan sesudah commit/sebelum ACK; proses ulang setelah restart PostgreSQL/backend/MQTT tetap idempoten. Tidak ada penutupan karena timer atau daya nol.
6. Energi fixture diketahui: batas tepat/rangkaian lengkap menghasilkan delta; hilang/ambigu/reset/gap/negatif menghasilkan null dan alasan; sensor terlambat direkonsiliasi tanpa toggle. Billing tetap tidak ada.
7. Owner A/B dan tenant A/B: daftar/filter/pagination/ID langsung dibatasi; tenant tidak mendapat payload/UID atau telemetry komunal. Kasus occupancy selesai tidak membocorkan interval setelah hak berakhir.
8. Docker dan PostgreSQL nyata; browser owner melihat riwayat bertambah dari dua tap MQTT. Regression login/logout, monitoring/history/daily, simulator existing, persistence sensor, fingerprint data lama. Catat hasil yang benar-benar dijalankan dan yang belum.

## Status implementasi

Pengguna menyetujui paket di atas pada 17 September 2026. Implementasi mengikuti mode satu peserta, predecessor lintas restart, deduplikasi dan energi konservatif. Worker inbox/rekonsiliasi berjalan setiap dua detik; UI owner polling lima detik ketika tab terlihat. Endpoint tidak mengekspos UID/payload/identitas peserta; label fasilitas cukup untuk tampilan tahap ini. Energi dievaluasi ulang maksimal 25 sesi per putaran (bergilir), dengan batas 100.000 sampel per sesi; melebihi batas menghasilkan null dengan alasan, bukan hasil terpotong.

Migration 007 melindungi identitas event/sesi, peserta dan konteks histori dari perubahan/destructive write. Belum ada UI/CLI pencabutan kartu, pemindahan penghuni, penyelesaian chain bercabang, atau koreksi sesi review; jangan mengedit histori/checkpoint secara manual untuk melewati review. Tindakan tersebut memerlukan alur administratif terpisah. MQTT listrik, broker/LAN dan billing tidak diubah.

Cara menjalankan dan contoh API: [LOCAL-DEVELOPMENT](LOCAL-DEVELOPMENT.md#simulasi-sesi-rfid). Bukti pengujian dan batas yang belum diuji: [HANDOFF](HANDOFF.md).

## Verifikasi akhir backend — 19 September 2026

- Migration 006–007 terpasang pada PostgreSQL persisten tanpa reset; suite integrasi Docker lulus 21/21 tanpa skip.
- Alur MQTT nyata menghasilkan sesi `e462e6a9-e2c6-42b4-b14f-e20675dc71bb`, durasi 120,026 detik, energi simulasi valid `0.025004416` kWh. Replay serentak dan replay setelah restart tidak men-toggle ulang.
- Konflik identitas, JSON rusak, QoS salah, device asing, dan event invalid tercatat sebagai rejection tanpa mengubah event canonical atau sesi. Kartu lain saat fasilitas sibuk, predecessor lintas restart/out-of-order, boundary hilang/ambigu, gap, reset counter, serta scope owner/tenant diverifikasi dengan PostgreSQL nyata.
- Fingerprint reading non-RFID identik sebelum/sesudah demo dan restart. Dataset deterministik 12 September tetap 1441 sampel dan simulator monitoring existing lolos verifikasi baca-saja.
- Kontrak ini selesai untuk backend simulasi lokal. Integrasi reader nyata, billing, broker/LAN, Railway, dan frontend Riwayat Fasilitas lanjutan tetap pekerjaan terpisah.
