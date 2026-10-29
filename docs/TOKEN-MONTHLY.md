# Token dan Tagihan Bulanan

Pencatatan owner untuk membandingkan **pembelian token Rupiah** dengan **alokasi tagihan final tenant**. Ini bukan tarif listrik baru, rekonsiliasi invoice PLN, arus kas, laba/rugi, ataupun pengukuran energi hilang. Token bisa masih tersisa; konsumsi owner/fasilitas belum tentu dibebankan ke tenant. Tidak mengubah kalkulasi atau nominal billing final, sensor, RFID, maupun simulator.

## Mencoba dari dashboard

1. Masuk sebagai owner lokal dengan akun existing. Pada halaman utama **Monitoring listrik**, bagian **Token dan Tagihan Bulanan** tampil sebelum panel meter.
2. Pilih properti (nama, bukan UUID) dan bulan. Lima kartu menampilkan pembelian token, tagihan final tenant, lunas, belum dibayar, dan **Selisih token dan tagihan**.
3. **Tambah pembelian token**: isi tanggal pembelian lokal properti, nominal Rupiah bulat tanpa pemisah, energi yang diperoleh dalam kWh (opsional), dan catatan opsional. kWh dapat ditulis dengan koma/titik pada form. Isi dari bukti pengisian, bukan counter kumulatif PZEM; contoh expo diberi catatan Simulasi expo. Beberapa pembelian pada bulan yang sama diperbolehkan. Tidak ada seed pembelian otomatis.
4. **Koreksi** mengubah tanggal/nominal/catatan dengan alasan wajib. Versi lama tetap tersimpan; koreksi tanggal ke bulan lain memindahkan kontribusi total token, bukan histori billing.
5. **Batalkan** meminta alasan dan konfirmasi. Baris tetap terlihat sebagai Dibatalkan tetapi tidak dihitung. Pembatalan terminal; jika perlu mencatat pembelian sebenarnya kembali, buat catatan baru dengan penjelasan, bukan menghidupkan versi dibatalkan.
6. Hasil request yang belum pasti mengunci isian; **Ulangi aksi yang sama** memakai key/payload/versi identik. Konflik versi meminta memuat versi terbaru; tidak menimpa diam-diam.

Tenant tidak mendapat bagian ini ataupun akses API-nya. Tidak perlu menambah tagihan final contoh untuk mencoba empty state. Jika belum ada periode final produksi yang memenuhi aturan bulan, nilai tagihan/lunas/belum dibayar/selisih adalah **Belum tersedia**, bukan nol. Pembelian token tetap dapat bernilai nol bila memang tidak ada catatan aktif.

## Aturan bulan dan billing

- `month=YYYY-MM` (2000–2099). Batas bulan `[awal bulan lokal, awal bulan berikutnya)` dihitung oleh PostgreSQL dari zona IANA `properties.timezone`, termasuk DST. Tidak mengikuti zona browser/server.
- `purchase_date=YYYY-MM-DD` adalah **tanggal kalender pembelian di properti**, bukan timestamp penerimaan atau UTC. Form memakai input tanggal, sehingga tanggal 1/akhir bulan tidak bergeser karena browser berada di zona lain.
- Hanya `billing_periods.status=finalized`, `source=production`, dengan `starts_at >= awal bulan` dan `ends_at <= awal bulan berikutnya` yang dihitung. Beberapa periode pendek dalam bulan dapat tercakup; ini bukan klaim semua hari telah ditagih. Metadata memuat jumlah dan daftar periode.
- Revisi superseded, draft, review, simulation/mixed tidak dihitung. Koreksi draft belum menggantikan final lama; sesudah koreksi finalized, hanya final pengganti dihitung.
- Total menggunakan `bill_shares` occupancy tenant, bukan total properti/room bill yang bisa mengandung bagian owner/unassigned. Nilai null pada alokasi final menghasilkan unavailable/review, tidak dijadikan nol.
- Periode final yang **beririsan tetapi melintasi batas bulan** dikecualikan dan dilaporkan sebagai `cross_month_periods`/`cross_month_period_excluded`. Tidak prorata, tidak dipindahkan penuh ke salah satu bulan. Jika ada periode eligible lainnya, `availability=partial`: kelima nilai hanya berdasarkan periode eligible dan UI menandai keterbatasannya. Jika tidak ada eligible final, total tagihan dan selisih null.
- `paid_total_rp` dan `unpaid_total_rp` mengelompokkan alokasi final eligible menurut **status pembayaran terkini**, default unpaid. `paid_at` tidak membatasi bulan; pembayaran di bulan lain tetap mengubah status kelompok periode ini. Pembayaran revisi superseded tidak otomatis dipindahkan ke revisi baru, mengikuti model pembayaran existing.
- Selisih signed = `token_total_rp - tenant_total_rp`, positif/nol/negatif. Tidak dipaksa menjadi nol dan tidak dikonversi menjadi kWh.

## Penyimpanan dan API

Migration baru **023_token_purchases.sql** hanya membuat struktur; 001–022 tidak diubah. `token_purchases` menyimpan identitas/properti/pencatat/status/head version. `token_purchase_revisions` menyimpan seluruh snapshot create/correct/cancel secara append-only, actor, alasan, waktu server dan request ID yang sama dengan audit existing. Guard melarang hard-delete/perubahan revisi/identitas/pembukaan ulang pembatalan; constraint deferred memastikan head punya versi sesuai saat commit. Tidak ada backfill/seeding akun, pembelian, atau tagihan.

Nominal API berupa **string digit desimal**, rentang Rp1–Rp1.000.000.000.000 per pembelian (batas implementasi lokal yang wajar dan eksplisit, bukan batas PLN). PostgreSQL `numeric(13,0)`, agregasi `numeric` dan pengurangan/formatter `BigInt` menjaga presisi; pecahan, negatif, nol, eksponen, numeric JSON, atau nominal di atas batas ditolak. Catatan/alasan maksimal 500 karakter; catatan opsional, alasan wajib untuk koreksi/pembatalan.

| Metode | Endpoint | Isi/filter |
|---|---|---|
| GET | `/api/owner/token-purchases` | `property_id`, `month`, `limit` (default 100, max 1000), `after`; `next_after` keyset UUID |
| POST | `/api/owner/token-purchases` | `property_id`, `purchase_date`, `amount_rp`, `note` opsional |
| PATCH | `/api/owner/token-purchases/:id` | `purchase_date`, `amount_rp`, `note` opsional, `row_version`, `reason` |
| POST | `/api/owner/token-purchases/:id/cancel` | `row_version`, `reason` |
| GET | `/api/owner/token-purchases/:id/revisions` | Histori append-only owner-scoped |
| GET | `/api/owner/monthly-token-summary` | `property_id`, `month` |

Semua endpoint require login/owner; properti/record asing 404, tenant 403, anonymous 401. Mutasi memakai Origin + X-CSRF-Token existing dan UUID **Idempotency-Key**. Transaksi mencakup head, snapshot, audit dan hasil idempotency. Advisory lock owner/key menolak request paralel in-progress; payload/metode/URL berbeda dengan key sama menghasilkan 409; retry mengembalikan hasil asli dari PostgreSQL, termasuk jika record kemudian dikoreksi. `row_version` stale 409. Key memakai namespace owner global yang sama dengan API master/billing. Tidak ada DELETE.

Ringkasan dihitung dalam satu SQL statement/snapshot konsisten, tanpa join pembelian ke share yang bisa menggandakan total. Daftar transaksi dipaginasi; frontend memuat seluruh halaman sebelum menampilkan hasil. Tidak ada sumber data mock runtime.

## Perintah lokal dan pengujian

```powershell
.\scripts\docker.ps1 compose build backend
.\scripts\docker.ps1 compose run --rm --no-deps backend npm run migrate
.\scripts\docker.ps1 compose up -d --no-deps backend
node --test web/*.test.js
npm test
npm run check
npm run build
```

Test PostgreSQL memakai stack verifikasi **terpisah** yang sudah tersedia dari pengujian RFID; jangan menjalankan setup/seed pada DB aplikasi hanya untuk fitur ini. Fixture token/billing di `test/token-api.test.js` berada dalam transaksi rollback; request paralel memakai koneksi PostgreSQL independen. Restart yang diuji di test token adalah restart server/router HTTP dengan record DB tetap, bukan klaim hardware atau power-cut database.

```powershell
.\scripts\docker.ps1 compose -f compose.rfid-verification.yaml run --rm --no-deps backend npm run migrate
.\scripts\docker.ps1 compose -f compose.rfid-verification.yaml run --rm --no-deps -e INTEGRATION_DB=1 backend node --test test/*.test.js
```

Smoke HTTP lokal hanya membaca data bisnis, menguji request mutasi yang sengaja ditolak sebelum transaksi, dan login/logout dengan secret file existing (tidak mencetak password/cookie). Session sementara dapat berubah; pembelian/billing tidak dibuat.

```powershell
$env:AUTH_TEST_BASE_URL='http://127.0.0.1:3000'
$env:AUTH_OWNER_PASSWORD_FILE='.local/secrets/owner_login_password'
$env:AUTH_TENANT_PASSWORD_FILE='.local/secrets/tenant_login_password'
node scripts/verify-token-summary-live.js
```

Hasil yang benar-benar dijalankan dan batas verifikasi visual ada di `HANDOFF.md`.

## Tahap pertama energi token — 22 Oktober 2026

- Migration **024_token_energy.sql** menambahkan `energy_kwh numeric(15,6)` nullable pada snapshot revisi. Tidak mengonversi Rupiah menjadi kWh dan tidak mengisi catatan lama secara otomatis. Nilai positif hingga 999999999.999999 kWh, maksimal enam desimal; batas ini batas penyimpanan prototipe, bukan ketentuan PLN.
- POST/PATCH pembelian menerima `energy_kwh` sebagai string desimal bertitik atau `null`. Omit pada POST berarti belum diketahui; omit pada PATCH mempertahankan kWh sebelumnya untuk kompatibilitas klien lama. `null` pada PATCH mengosongkan catatan energi dengan alasan koreksi wajib. String kosong ditolak API; form mengirim `null` ketika kosong. Angka JSON, nol, negatif, eksponen dan lebih dari enam desimal ditolak.
- Daftar dan histori revisi mengembalikan kWh sebagai string/null. Snapshot lama tetap immutable; pembatalan mempertahankan energi snapshot dan mengeluarkan pembelian dari total. Retry, versi, audit, CSRF dan owner scope mengikuti mekanisme existing.
- Ringkasan bulanan menambah `purchase_count`, `energy_missing_count`, `energy_total_kwh`. Total hanya tersedia jika ada pembelian aktif dan semuanya memiliki kWh; jika kosong atau sebagian belum dicatat, total `null`, bukan nol atau jumlah parsial yang diklaim lengkap. Tanggal yang dikoreksi mengikuti aturan bulan properti existing. Pembelian dibatalkan dikecualikan.
- UI menampilkan kolom Energi diperoleh serta ringkasan **Energi pembelian bulan ini**. Ini jumlah energi masuk bulan terpilih, **bukan estimasi saldo tersisa**. Pencatatan manual bukan pengukuran PLN atau sensor.
- Tahap berikutnya: saldo awal dengan waktu/counter acuan, pilihan meter utama/cakupan konsumsi agar kamar/komunal/RFID tidak dihitung ganda, saldo lintas bulan, kualitas/reset/gap/stale data, peringatan menipis, dan pemeriksaan keseimbangan alokasi (`total konsumsi - total alokasi = 0`). Tahap pertama belum mengubah formula billing, pembagian shared, FDI atau alokasi tenant.

## Estimasi otomatis dari nominal — 22 Oktober 2026

**Pembaruan UI terbaru:** sesuai permintaan pengguna setelah tahap ini, form owner tidak lagi menampilkan isian tarif/pajak. Pembelian baru cukup nominal (serta tanggal dan catatan opsional); backend memakai contoh konversi expo yang sama. Opsi manual berada di bagian **Opsi pengisian energi** yang tertutup secara default. Detail teknis asumsi tetap disimpan di snapshot revisi.

Form pembelian baru kini default **Hitung otomatis (simulasi expo)**. Ketik nominal untuk melihat estimasi kWh; tarif/pajak dapat diubah. Default contoh dari diskusi adalah Rp1444.70/kWh dan pajak3%, **bukan penetapan tarif operasional atau pengecekan tarif PLN terkini**. Rp50000 menghasilkan33.57kWh, Rp100000 menghasilkan67.14kWh. Rumus simulasi: `(nominal × (1 − pajak/100)) / tarif`, dibulatkan half-up ke dua desimal. Model ini belum menghitung biaya admin atau kebijakan pajak PLN daerah tertentu. Tidak membaca meter PLN atau mengisi token fisik.

- Pilih **Isi kWh dari bukti pengisian** untuk input manual existing. Catatan manual lama tetap dibuka dalam mode manual; catatan estimasi dibuka dengan asumsi tersimpannya. Mengganti nilai nominal/tarif/pajak membersihkan pratinjau lama saat permintaan baru diproses; hasil gagal/koneksi putus tidak menampilkan hasil lama sebagai hasil terbaru.
- GET owner-only `/api/owner/token-energy-estimate?amount_rp=50000&tariff_rp_per_kwh=1444.70&tax_percent=3` mengembalikan `energy_kwh` dan `energy_calculation`. Ini kalkulator stateless tanpa transaksi DB, bukan resource publik. Nilai nominal mengikuti batas existing; tarif string positif maksimal6angka bulat/4desimal; pajak string0–99.99 (dua desimal). Hasil yang dibulatkan menjadi0atau melewati batas penyimpanan ditolak.
- POST/PATCH pembelian menerima `energy_estimate: {tariff_rp_per_kwh: '1444.70', tax_percent: '3'}` **sebagai alternatif** `energy_kwh`. Mengirim keduanya ditolak. Backend menghitung ulang dengan aritmetika integer; tidak mempercayai hasil kWh dari browser.
- Migration **025_token_energy_estimate.sql** menambah snapshot `energy_calculation` nullable dengan kind `simulation_estimate`, method `nominal_less_tax_v1`, tarif, pajak, dan aturan pembulatan. Manual tetap null; tidak mengubah/mengisi histori lama. Shape metadata dan lifecycle pembatalan dijaga SQL. Asumsi melekat pada tiap revisi dan audit; pembatalan wajib mempertahankannya.
- PATCH tanpa kedua field energi mempertahankan kWh manual, tetapi untuk catatan estimasi menghitung ulang nominal terbaru dengan asumsi tersimpan. Override `energy_kwh` eksplisit mengubah mode menjadi manual; `energy_estimate` eksplisit menghitung ulang dengan asumsi yang dikirim.
- Daftar memberi label **Estimasi simulasi expo** beserta tarif/pajak. Ringkasan menambah `energy_estimated_count`; jika total mencakup estimasi, label jumlah pembelian estimasi terlihat. Total pembelian tetap berbeda dari saldo tersisa, tidak mengubah konsumsi sensor atau tagihan final.

### Form nominal saja

Label hasil adalah **Energi token: 33,57 kWh** dengan penanda **Estimasi expo**. Mengetik nominal hanya membuat pratinjau; menekan Simpan mencatat energi masuk. Tahap ini belum menghitung saldo tersisa. Daftar cukup menampilkan label Estimasi expo tanpa rincian tarif/pajak pada setiap baris.

GET kalkulator kini cukup `?amount_rp=50000`; mutasi otomatis boleh mengirim `energy_estimate: {}`. Default tarif1444.70 dan pajak3 hanya didefinisikan di backend. Parameter API eksplisit tetap diterima untuk kompatibilitas; koreksi catatan estimasi memakai asumsi snapshot sebelumnya agar histori tidak berganti konversi diam-diam. Tidak ada perubahan schema/data lama atau migration baru untuk penyederhanaan ini.
