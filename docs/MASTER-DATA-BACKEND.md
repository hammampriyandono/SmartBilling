# Backend manajemen data master owner

Status 21 September 2026: migration 008–012 dan API backend diterapkan untuk development lokal. UI admin yang ada tetap baca-saja; tahap ini tidak mengubahnya.

## Model histori

- Tidak ada public hard-delete. Audit, reading, event, sesi, participant, serta record master temporal tidak dapat dihapus.
- `row_version` wajib pada mutasi record existing; versi lama menghasilkan HTTP 409.
- Relasi historis tidak dipindahkan. Pergantian kartu, reader, device, dan pemasangan meter menutup record lama lalu membuat record baru.
- `meter_assets` menyimpan meter fisik; `meters` tetap merupakan riwayat pemasangan pada device/channel/target.
- Data `source=simulation` dapat dilihat owner tetapi mutasinya ditolak API dengan `simulation_read_only`.
- Seluruh mutasi owner menulis `audit_logs` dalam transaksi yang sama. Password, token mentah, UID kartu mentah, dan payload MQTT tidak ditulis ke audit.

## Endpoint

Semua endpoint `/api/owner/*` memerlukan cookie login owner, `Origin` yang benar, dan `X-CSRF-Token` untuk mutasi. Daftar utama:

- properti: `GET /api/owner/properties`, `PATCH /api/owner/properties/:id` (ubah nama, `row_version` dan `reason` wajib; ID tetap);

Guard role owner dipasang hanya pada namespace `/owner` di dalam router ini. Karena `masterApi` dipasang pada `/api`, request tenant ke `/api/rooms`, `/api/meters`, `/api/facilities`, dan `/api/usage-sessions` harus diteruskan ke router monitoring/RFID berikutnya; scope datanya tetap ditentukan occupancy. Request tenant ke root maupun turunan `/api/owner` ditolak `403 owner_required`.

- kamar: `GET/POST /api/owner/rooms`, `PATCH /api/owner/rooms/:id`, `POST .../:id/deactivate`;
- fasilitas: `GET/POST /api/owner/facilities`, `POST .../:id/deactivate`;
- device: `GET/POST /api/owner/devices`, `POST .../:id/deactivate`;
- aset meter: `GET/POST /api/owner/meter-assets`, `POST .../:id/retire`;
- pemasangan: `GET/POST /api/owner/meter-installations`, `POST .../:id/retire`, `POST .../:id/move`;
- reader: `GET/POST /api/owner/readers`, `POST .../:id/retire`;
- kartu: `GET/POST /api/owner/rfid-cards`, `POST .../:id/revoke`, `POST .../:id/replace`;
- tenant: `GET /api/owner/tenants`, `POST /api/owner/tenants/invitations`;
- occupancy: `GET/POST /api/owner/occupancies`, `POST .../:id/end`, `POST .../:id/move`.

Aktivasi tenant memakai `POST /api/auth/activate` dengan token sekali pakai dan password baru. Database hanya menyimpan SHA-256 token. Email existing ditolak pada invitation owner agar akun aktif tidak dapat diambil alih; dukungan tenant existing menerima membership properti kedua memerlukan flow persetujuan tenant terautentikasi pada tahap terpisah.

Body mutasi memakai JSON ketat, timestamp ISO 8601 berzona, `reason`, dan `row_version` untuk perubahan existing. Seluruh `POST`/`PATCH` `/api/owner` wajib menyertakan `Idempotency-Key` berupa UUID unik per aksi, di samping cookie, Origin, dan CSRF. Retry dengan key, method, URL dan payload JSON yang sama mengembalikan status/data awal; perubahan payload atau endpoint dengan key sama menghasilkan `409 idempotency_key_conflict`. Selama transaksi pertama masih berjalan, retry mendapat `409 idempotency_in_progress` dan dapat dicoba lagi dengan key sama. Kesalahan sebelum commit tidak menyimpan hasil, sehingga key boleh dicoba lagi setelah input diperbaiki hanya jika mutasi pertama belum berhasil.

Catatan keamanan: idempotency disimpan per owner di PostgreSQL sebagai HMAC request, respons aman, dan waktu pembuatan. Body mentah, UID kartu, cookie, password, payload MQTT dan token aktivasi mentah tidak disimpan. Token undangan direkonstruksi dengan HMAC secret server dan key pada retry identik; tabel invitation tetap hanya menyimpan SHA-256 token. Karena itu secret server harus dipertahankan lintas restart; rotasi secret memerlukan rencana migrasi token/key tersendiri. Key dan respons tidak kedaluwarsa otomatis. Simpan key undangan seperti kredensial sampai token digunakan/kedaluwarsa; jangan taruh di URL atau log.

## Migration

- `008_master_data_history.sql`: audit append-only, source/row version, meter assets, backfill dan lifecycle guard.
- `009_property_memberships.sql`: membership properti, invitation token hash, dan backfill membership dari occupancy.
- `010_meter_installation_compatibility.sql`: memastikan jalur provisioning terpercaya lama tetap membuat aset fisik untuk setiap pemasangan baru.
- `011_master_guard_fix.sql`: guard identity spesifik tabel agar update lifecycle kamar tidak membaca field device.
- `012_owner_idempotency.sql`: hasil mutasi owner append-only, unik per owner dan key, aman setelah restart.
- `022_property_rename_concurrency.sql`: versi optimistic concurrency dan waktu pembaruan untuk metadata properti.

Verifikasi nyata di PostgreSQL mencakup retry, dua request paralel dengan key sama, konflik endpoint/payload, invitation, move occupancy, replace kartu, dan move pemasangan meter. Selain suite transaksi 23/23, retry HTTP setelah restart fisik backend dibuktikan dengan satu fixture master terpisah: hasil 201 sama, satu kamar, satu audit. Fixture berlabel `UJI IDEMPOTENSI — bukan data pengamatan` pada properti `da7a96ec-b738-435e-a617-3a20855edda1`; tidak memiliki meter/pembacaan/sesi dan tidak mengubah dataset simulasi lama.

Migration 001–007 tidak diubah. Backfill tidak membuat akun, occupancy, reading, event, tap, atau sesi.

## Batas

- UI administrasi owner tersedia; email service dan registrasi publik belum tersedia. Billing/backend berjalan terpisah sesuai dokumentasi billing; status deploy Railway perlu diverifikasi saat ada permintaan deploy.
- Pergantian device dilakukan dengan create device baru, retire/move mapping, kemudian deactivate device lama; identitas device lama tidak diedit.
- Reader pengganti dibuat setelah record reader lama di-retire.
- API belum menyediakan tenant aktif menerima undangan properti tambahan; invitation owner saat ini hanya untuk email baru.
