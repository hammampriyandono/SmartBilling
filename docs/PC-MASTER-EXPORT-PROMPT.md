# Instruksi untuk menyiapkan ekspor di PC

Saya melanjutkan SmartBilling dari PC rumah ke laptop. Paket alat transfer dari laptop sudah disediakan; paket data master asli PC belum dibuat.

Baca AGENTS.md, docs/HANDOFF.md, docs/LOCAL-DEVELOPMENT.md dan docs/LAPTOP-MASTER-TRANSFER.md. Periksa Git, kode, Docker, stack expo dan database PC existing terlebih dahulu. Jika alat belum ada di repository, bandingkan isi ZIP alat sebelum menyalinnya; jangan menimpa perubahan kerja PC.

Tujuan pekerjaan di PC ini hanya membuat ekspor master privat dari properti yang benar-benar dipakai: owner, Nadia, Rozan, Kamar 1, Kamar 2, membership/occupancy beserta seluruh tanggal aslinya, perangkat, aset meter dan pemasangan ESP32 Kamar 1/Kamar 2/meter utama. Fasilitas manual existing boleh ikut sesuai alat. Pertahankan UUID, device_uid, channel, label, versi dan relasi sumber. Jangan menebak ID, membuat seed atau menampilkan isi password/hash/token di keluaran.

Gunakan `node scripts/pc-laptop-master.js catalog` untuk mengidentifikasi properti sumber, lalu jalankan export dengan UUID tersebut dan inspect sesuai panduan. Export harus berupa snapshot READ ONLY. Verifikasi ringkasan akun/kamar/occupancy/perangkat serta mapping yang dimaksud; bila berbeda dari keterangan saya, laporkan keadaan sebenarnya sebelum memilih data secara asumtif.

Hasil yang harus tersedia adalah `.local/master-transfer/master-private.json`, dengan ringkasan jumlah dan SHA256. File berisi data pribadi/password hash sehingga tidak boleh di-commit, di-push, ditempel di chat atau dimasukkan ZIP alat. Beri tahu lokasi file agar dapat saya pindahkan secara privat ke laptop. Jangan mengekspor seluruh histori sensor atau secret Wi-Fi/MQTT/database tanpa permintaan terpisah.

Jangan menjalankan import/apply/migration pada PC, mengubah database, me-reset volume, membuat tarif/tagihan, mengubah kredensial/jaringan/firewall, mem-flash ESP32, commit atau push. Endpoint broker laptop dan kemungkinan konflik UUID akan ditangani di laptop setelah paket sumber tersedia. Jelaskan bila ekspor tidak dapat dilakukan dari lingkungan ini; jangan mengaku data asli PC telah dibuat hanya dari kode Git.
