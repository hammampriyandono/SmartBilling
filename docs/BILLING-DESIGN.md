# Backend billing v1 — implementasi dan batas verifikasi

Status 25 September 2026: kebijakan MVP telah disetujui dan backend sudah diimplementasikan melalui migration 013–020, kalkulator murni, service transaksi, API owner/tenant, UI billing, serta lifecycle pembayaran manual. Tidak ada seed tarif atau tagihan permanen dan tidak ada perubahan nilai histori sensor/sesi. Seluruh fixture billing PostgreSQL berjalan dalam transaksi rollback.

## Batas hasil dan status

Perhitungan tetap di backend dan memakai interval setengah terbuka `[starts_at, ends_at)` dalam timezone properti. Periode lazimnya bulanan, tetapi rentang tidak ditanam sebagai tanggal kalender tetap.

Lifecycle periode adalah `draft → review|finalized → superseded`. Koreksi bukan update angka final: koreksi membuat revisi baru dengan rentang sama, `revision_no` berikutnya, `revision_kind=correction`, `supersedes_period_id`, alasan, dan snapshot input baru. Versi lama tetap immutable.

Status dipisahkan pada dua tingkat:

- `property_reconciliation_status`: kelengkapan meter utama dan residual properti;
- `room_bill_status`: kelengkapan meter kamar, tarif, occupancy, dan sesi attributable yang masuk kamar tersebut.

Meter utama yang tidak lengkap membuat rekonsiliasi properti `review`, tetapi **tidak menahan finalisasi room bill yang inputnya lengkap**. Konsekuensinya, residual/shared tingkat properti tidak boleh dimasukkan diam-diam ke nominal payable kamar MVP. Untuk tahap awal, room bill memuat biaya energi meter kamar dan sesi RFID attributable yang valid. Residual properti bersifat informasional/review sampai tim menyetujui metode pembagian shared. Jika kelak shared ditagihkan, penambahannya harus melalui revisi/koreksi, bukan perubahan tagihan final lama.

## Kebijakan MVP yang diterapkan

1. Tarif hanya energi dalam Rupiah/kWh; tidak ada biaya tetap, pajak, denda, payment, atau rekonsiliasi invoice eksternal.
2. Tarif adalah konfigurasi temporal per properti, dibuat owner dengan sumber/referensi yang jelas. Setiap kalkulasi menyimpan snapshot tarif; tidak ada nilai default tersembunyi.
3. Multi-peserta pada satu sesi fasilitas belum didukung. Sesi tersebut dan komponen attributable terkait menjadi `review`, energinya/biayanya `null`.
4. Konsumsi meter fasilitas di luar sesi RFID tidak diberikan kepada pengguna terakhir. Ia menjadi issue rekonsiliasi properti `facility_energy_outside_session`.
5. Konsumsi kamar pada interval tanpa occupancy menjadi share `owner_unassigned` (`occupancy_id=null`), bukan nol dan bukan dipindahkan ke tenant sebelum/sesudahnya.
6. Sesi yang beririsan dengan perpindahan occupancy atau batas periode menjadi `review`; pembagian berdasarkan durasi dilarang.
7. Pembulatan hanya pada Rupiah akhir. Gunakan largest remainder; sisa diberikan menurut pecahan terbesar, lalu ID canonical ascending sebagai tie-break deterministik.
8. Ambang gap production belum ada. Draft produksi tidak boleh memakai 120 detik dari simulator sebagai default diam-diam. Tanpa policy gap yang disetujui berdasarkan firmware/interval sampling nyata, finalisasi data production ditahan.
9. Data `source=simulation` hanya boleh menghasilkan preview berlabel simulasi dan tidak boleh finalized sebagai tagihan nyata.

## Perhitungan kamar dan fasilitas

Counter kWh selalu kumulatif. Pecah perhitungan menurut pemasangan meter, `counter_epoch`, perubahan tarif, serta boundary occupancy yang diperlukan. Setiap segmen memerlukan boundary awal/akhir tepat, kualitas valid, timestamp tunggal, counter tidak turun, dan gap di bawah policy snapshot. Jangan mengurangkan counter lintas meter/epoch.

Pergantian meter dijumlahkan sebagai beberapa segmen hanya bila setiap segmen lengkap. Satu segmen wajib yang tidak lengkap membuat energi dan biaya komponen tersebut `null` serta room bill `review`. Pindah kamar menghasilkan share berbeda pada occupancy lama dan baru; histori tidak dipindahkan. Bila boundary perpindahan tidak lengkap, energi kamar periode mungkin dapat dihitung untuk diagnosis, tetapi alokasi tenant dan nominal final harus `null/review`.

Sesi RFID hanya billable bila selesai, satu participant, `energy_status=valid`, berada penuh dalam satu occupancy dan satu periode, tarif tersedia, dan provenance bukan simulasi untuk tagihan nyata. Biaya sesi berasal dari `usage_sessions.energy_kwh × rate`; tap/payload MQTT tidak membawa nominal. Sesi open/review, energi null, multi-peserta, lintas occupancy, atau lintas periode tidak dikenakan nol: alokasi dan biaya menjadi `null` dengan reason.

## Nilai null dan review

Gunakan reason terstruktur, sedikitnya: `no_data`, `missing_start_boundary`, `missing_end_boundary`, `gap_policy_unset`, `gap`, `counter_reset`, `counter_decreased`, `ambiguous_timestamp`, `invalid_quality`, `meter_replacement_incomplete`, `tariff_missing`, `tariff_overlap`, `occupancy_boundary_missing`, `session_open`, `session_energy_unavailable`, `multiple_session_participants`, `session_crosses_occupancy`, `session_crosses_period`, `facility_energy_outside_session`, `simulation_not_finalizable`, `negative_property_residual`, dan `rounding_invariant_failed`.

Komponen yang inputnya tidak lengkap menjadi `null`; jangan mengubahnya menjadi nol. `observed_consumption_kwh` boleh disimpan sebagai bukti diagnostik draft, tetapi bukan energi billable. Total room bill hanya finalized jika seluruh komponen payable MVP untuk kamar itu valid. Rekonsiliasi properti boleh tetap review secara independen.

## Migration yang diterapkan

Migration 001–012 tidak diedit. Migration hanya menambah struktur, guard, serta provenance; tidak membuat akun, tarif, periode, atau tagihan.

### Tahap A — provenance dan tarif (`013`)

- provenance immutable bagi readings/event/sesi atau rujukan dataset yang setara;
- backfill seluruh data existing sebagai simulation tanpa mengubah nilai/waktu/identitas histori;
- `tariff_schedules` temporal per properti: rate, currency IDR, source reference, lifecycle, `row_version`, `source`;
- exclusion untuk rentang tarif overlap dan guard append-only identity;
- belum membuat periode atau hasil billing.

Gate review: backfill hanya metadata, fingerprint histori lama identik, simulation tidak dapat menjadi tarif production.

### Tahap B — periode dan hasil (`014`)

- `billing_periods`: property, range, revision chain, calculation/policy snapshot, status rekonsiliasi properti dan room rollup;
- `billing_meter_segments`: satu baris per installation/epoch/tariff slice, boundary reading dan evidence nullable;
- `billing_issues`: reason terstruktur dan scope property/room/session;
- `room_bills`, `bill_shares`, dan `bill_session_allocations` sebagai snapshot hasil dan alokasi;
- hasil draft/review boleh null; belum ada finalisasi publik.

Gate review: periode/revisi tidak overlap kecuali rentang identik, scope satu properti, kalkulasi tidak menyentuh readings/sessions.

### Tahap C — integritas relasi (`015`)

- validasi property/range/revision correction;
- validasi bahwa segmen, room bill, share, session allocation, dan issue tetap berada pada property/occupancy yang benar;
- unique owner_unassigned/occupancy dan referensi histori memakai `ON DELETE RESTRICT`.

Gate review: room valid dapat finalized ketika property reconciliation review; komponen review tidak menjadi nol; multi-peserta/lintas batas menghasilkan null.

### Tahap D — lifecycle final dan guard (`016`–`019`)

- final/superseded dan seluruh child snapshot immutable;
- satu revisi finalized yang berlaku per property/range;
- correction chain tanpa siklus dan revisi berurutan;
- audit append-only untuk calculate/review/finalize/correct/supersede;
- transaksi dan row lock untuk kalkulasi/finalisasi paralel;
- tidak membuat akun, tarif, periode, atau tagihan melalui migration.

Gate review: concurrency, rollback, koreksi, idempotency, ownership dan immutable history lulus di PostgreSQL nyata.

## API tersedia

Owner:

- `GET|POST /api/owner/tariff-schedules`, `POST /api/owner/tariff-schedules/:id/retire`;
- `GET|POST /api/owner/billing-periods`, `GET /api/owner/billing-periods/:id`;
- `POST /api/owner/billing-periods/:id/recalculate|finalize|corrections`.

Semua mutasi memakai CSRF, `Idempotency-Key`, ownership, transaksi, audit existing, dan `row_version` pada operasi yang mengubah record existing. Key yang sama hanya boleh direplay untuk method/path/payload yang identik.

Tenant: `GET /api/billing-periods` dan `GET /api/billing-periods/:id` hanya mengembalikan revisi finalized dan share occupancy miliknya. Tenant tidak melihat share penghuni lain, UID/payload RFID, telemetry komunal mentah, atau audit owner. `/api/owner` tetap 403 bagi tenant; resource asing 404; tanpa sesi 401.

Pembayaran manual disimpan terpisah dari nominal immutable di `bill_payment_states`; default tanpa record dibaca sebagai `unpaid`. `bill_payment_events` append-only menyimpan aksi lunas/batal lunas, waktu efektif, catatan, actor, reason dan request ID. Mutasi owner memakai endpoint `mark-paid`/`unmark-paid`, CSRF, idempotency PostgreSQL, ownership, `payment_row_version`, transaksi dan `audit_logs`. Hanya share occupancy pada periode berstatus `finalized` yang dapat dimutasi. Koreksi tidak memindahkan pembayaran ke revisi baru, dan share revisi yang sudah superseded tidak dapat diubah lagi. MVP tidak mencakup gateway, bukti transfer atau pembayaran otomatis.

## Fixture kalkulasi

Fixture statis berada di `test/fixtures/billing-calculation-v1.json`. Ia bukan seed dan tidak dibaca aplikasi. Semua UUID, counter, tarif, dan nominal sintetis. Fixture membekukan input/expected untuk:

- room bill valid ketika main reconciliation review;
- owner/unassigned untuk kamar kosong;
- pergantian meter lengkap/tidak lengkap;
- boundary hilang, gap policy production belum ada, reset dan counter turun;
- sesi RFID peserta tunggal valid;
- multi-peserta, energi di luar sesi, dan sesi lintas batas menjadi review;
- pembulatan largest remainder dengan tie-break ID.

Kalkulator murni membaca fixture ini tanpa database. Skenario PostgreSQL/API memakai fixture sintetis lain dalam transaksi rollback; bukan dataset simulasi/pengamatan permanen.

## Batas yang tetap memerlukan keputusan lanjutan

- metode pembagian shared bila fitur itu ditambahkan;
- metode multi-peserta fasilitas;
- ambang gap production;
- apakah pembagian energi kamar untuk beberapa occupancy bersamaan memakai equal-present atau kebijakan lain;
- alur administratif untuk issue/review sebelum koreksi.

Schema RFID saat ini memang membatasi satu participant per sesi. Kalkulator tetap tidak memiliki kebijakan alokasi multi-peserta; bila model itu dibuka kelak, hasil harus `review/null` sampai kebijakan disetujui. Karena ambang gap production tetap `null`, periode production nyata akan review sampai policy berdasarkan firmware dan interval sampling ditetapkan. Data simulation menghasilkan preview dan guard API/database menolak finalisasi.

## Bukti verifikasi 24 September 2026

- Suite Docker dengan PostgreSQL nyata: 28/28 lulus, termasuk tarif temporal, exact boundary, meter berganti, null/review, idempotency, scope, finalisasi, koreksi, dan immutable history.
- Main meter yang tidak lengkap mempertahankan `property_reconciliation_status=review`, sementara room bill valid tetap finalized. Beban fasilitas di luar sesi menghasilkan issue dan tidak dialokasikan.
- Restart backend lulus; smoke MQTT/PostgreSQL lulus; dataset simulasi 12 September tetap 1.441 reading.
- Fingerprint isi kolom historis lama identik: 4 sesi `45732f4a2093e38b28ffe5e0706cde6e`, 8 event `71b085ebafe2e3aad388f23b4d3f7fb3`, 1.457 reading `1e58cd31a8eff1d6c0d8a434cbcbb54a`, dan 1.450 reading non-RFID `3e93b4b5220142a05ef009871618f8cf`. Kolom provenance baru dikecualikan dari perbandingan setara tersebut.
