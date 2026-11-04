# Deploy SplitzBill ke Railway

Panduan 4 November 2026. Repository membawa kode, bukan akun, tarif, tagihan atau pengamatan PostgreSQL lokal. Jangan menjalankan seed/demo di cloud. Migrasi skema dijalankan sebelum backend dimulai; pemindahan data nyata merupakan langkah tersendiri.

## Instalasi aktif setelah transfer data

Backend pada [dashboard Railway](https://splitzbilla05.up.railway.app) telah Online dan datanya dipindahkan4November2026. Domain dipersingkat sesuai pilihan pengguna; AUTH_ORIGIN mengikuti `https://${{RAILWAY_PUBLIC_DOMAIN}}` dan login ketigaakun sudah diuji setelah redeploy. **DATABASE_URL Backend sekarang menuju `splitzbill_prod_20261104`** pada service Postgres yang sama. Databaseawal `railway` tetap disimpan kosong sebagai cadangan sebelum transfer; contoh umum `${{Postgres.DATABASE_URL}}` di bawah berlaku untuk setup baru dan tidak menunjuk dataset aktif ini. File privat `.local/railway-setup/backend-variables.env` sudah mengikuti konfigurasi aktif.

Tiga akun existing (owner/Gloria/Rozan),2.430reading,22sesiRFID dan3periode tagihan ikut dipindahkan, tanpa sesi login lama/fixture. Login dan isolasi tenant, snapshot tagihan final serta readiness PostgreSQL/MQTT terverifikasi. Backup/receipt privat ditunjuk `.local/railway-setup/local-backup-pointer.json`; kunci SSH sementara transfer sudah dicabut. ESP dan listenerMQTTTLS publik belum dikonfigurasi. Rincian pemeriksaan serta penyesuaian checksumCRLF/LF saat restore ada di HANDOFF.

## Persiapan kode

- Backend memakai Dockerfile Node22, build frontend operational, migrasi pre-deploy dan healthcheck `/health/ready`. Broker memakai `Dockerfile.mqtt`. Pengaturan Build/Deploy diisi langsung pada setiap service sesuai langkah di bawah.
- Dokumentasi Railway yang diperiksa4November2026 menyatakan Config as Code TOML/JSON deprecated dan service baru tidak dapat opt-in. Karena itu paket ini tidak bergantung pada `railway.toml`; pilih Dockerfile melalui variable `RAILWAY_DOCKERFILE_PATH` dan isi Deploy di dashboard. [Kebijakan platform](https://docs.railway.com/config-as-code), [Dockerfile path](https://docs.railway.com/builds/dockerfiles).
- Keduanya satu replica dan Serverless/sleep dimatikan. Jangan menambah replica subscriber dengan clientID yang sama. Broker menggunakan volume `/mosquitto/data`.
- Runtime mendukung secret environment Railway maupun berkas `*_FILE` Compose lokal. Jangan mengisi keduanya untuk nama secret yang sama. `DATABASE_URL` dipakai untuk PostgreSQL cloud; guard seed/simulator tetap hanya mengizinkan database development lokal.
- `node scripts/verify-production.js` membangun dan menguji stack Docker sementara pada jaringan internal terpisah, lalu menghapus container/volume uji. Log dan credential fixture berada di `.local/production-verification/`, bukan Git. Docker CLI perlu tersedia di PATH. Perintah ini tidak menghubungi Railway atau ESP.

## Membuat project dan database

1. Buat Empty Project. Settings → General → Project name → `SplitzBill` → Update.
2. Add → Database → PostgreSQL. Pertahankan nama `Postgres` untuk mengikuti contoh referensi variabel; jika berbeda, sesuaikan referensinya.
3. Tunggu Postgres Online dan pastikan volume database tersedia. Pilih PostgreSQL17 agar selaras dengan sumber lokal bila akan membawa data existing. Jangan mengganti major version service existing yang sudah berisi data.
4. Add → Empty Service dua kali. Service pada screenshot pengguna bernama **MQTT** dan **Backend**; contoh reference variables mengikuti kapitalisasi ini. Pilih region yang sama dengan database.

## Mengonfigurasi mqtt

1. Service **MQTT → Settings**. Root Directory tetap `/`. Bagian Build: gunakan Dockerfile (terdeteksi melalui variable pada langkah3), Custom Build Command kosong. Bagian Deploy: Custom Start Command, Pre-deploy Command dan HTTP Healthcheck Path kosong agar ENTRYPOINT image menjalankan broker; Replicas1, RestartPolicyOnFailure/retry10 dan ServerlessOff. Jangan memilih config file TOML.
2. Buat volume dari menu canvas/CommandPalette, hubungkan ke **MQTT** dan isi mount path **`/mosquitto/data`**.
3. Isi Variables mengikuti [contoh broker](../deploy/railway-mqtt.env.example), termasuk **`RAILWAY_DOCKERFILE_PATH=Dockerfile.mqtt`**: backend username dan password acak64karakterhex. Device credentials boleh kosong sampai endpoint/firmware siap. Daftarkan tiap perangkat dengan UID sama seperti database serta password berbeda, format `UID|sensor/rfid/combined|password` dalam **satu variable multiline**.
4. Setelah perubahan kode terbaru sudah di-push, hubungkan Source ke repository GitHub SmartBilling, branch yang memuat konfigurasi ini. Tinjau staged changes lalu Deploy. Pastikan service mulai dengan berhasil.
5. Listener1883 hanya untuk jaringan privat backend. **Jangan membuat TCP Proxy publik menuju1883**. Belum ada endpoint publik ESP pada tahap ini.

## Mengonfigurasi backend

1. Service **Backend → Settings**. Root Directory `/`, Custom Build Command kosong. Deploy: Pre-deploy Command **`node scripts/migrate.js`**, Custom Start Command **`node src/server.js`**, Healthcheck Path **`/health/ready`** dan timeout120detik, Replicas1, RestartPolicyOnFailure/retry10, ServerlessOff. Set nilai ini melalui dashboard; jangan bergantung pada config file TOML.
2. Isi Variables mengikuti [contoh backend](../deploy/railway-backend.env.example), termasuk `RAILWAY_DOCKERFILE_PATH=Dockerfile`. Referensi database adalah `${{Postgres.DATABASE_URL}}`, sedangkan broker `mqtt://${{MQTT.RAILWAY_PRIVATE_DOMAIN}}:1883`. Gunakan reference variables; jangan menyalin URL berkredensial ke chat, source atau screenshot.
3. Buat `SESSION_SECRET` acak sedikitnya32karakter. Set `AUTH_ORIGIN` ke origin HTTPS domain backend yang sesungguhnya, tanpa trailing slash/path. Origin harus sama dengan alamat browser untuk login/CSRF. `PORT` disediakan Railway.
4. Settings → Networking → Generate Domain, target port aplikasi mengikuti `PORT`. Jika domain baru dapat dibuat sesudah deployment pertama, isi AUTH_ORIGIN setelah domain tersedia dan redeploy. Jangan memakai origin localhost pada production.
5. Hubungkan repository/branch setelah variabel dan config path siap. Pastikan pre-deploy `node scripts/migrate.js` berhasil dan `/health/ready` HTTP200. Migration menjaga checksum/transaksi dan **tidak** menghapus atau mengisi data sensor.
6. Production memakai cookie Secure/HttpOnly/SameSite=Lax, dengan satu hop proxy. Akses melalui HTTPS. `ROOM_RELAY_CONTROL_ENABLED=false` tetap berlaku sampai uji perangkat diteruskan secara terpisah.

## Membawa data lokal dan memeriksa aplikasi

- Database baru setelah migration masih kosong. Akun owner, Gloria/Rozan, properti, pemetaan meter, kartu, tarif dan tagihan tidak ikut Git push. Sebelum mencoba login cloud, pindahkan dataset nyata yang disetujui dengan backup, pemeriksaan cakupan/relasi dan target kosong yang terverifikasi. Jangan menyalin fixture simulasi atau sesi login lama.
- Skrip transfer master laptop existing belum mencakup semua histori/tagihan/kartu dan masih memiliki guard development. Jangan menghapus guard atau menjalankannya langsung pada cloud sebagai jalan pintas.
- Setelah data dipindah: uji login ketiga akun, isolasi kamar tenant, tagihan final, histori bertanggal, refresh/restart dan health. Jangan menyimpulkan data hilang hanya karena database cloud belum diisi.
- Histori Monitoring Kamar2 saat ini masih mengikuti pemasangan aktif baru yang0reading;602reading lama tersimpan pada pemasangan sebelumnya. Perbaikan lintas pemasangan belum termasuk paket runtime ini.

## Endpoint ESP: tahap terpisah setelah cloud siap

Railway TCP Proxy meneruskan TCP; HTTPS dashboard tidak memberi TLS kepada MQTT. Broker ini menyediakan listener8883 hanya bila `MQTT_TLS_CERT` dan `MQTT_TLS_KEY` berisi chainsertifikat/kunci PEM yang sesuai dengan hostname MQTT sebenarnya. Setelah sertifikat siap, tambahkan TCP Proxy target8883 dan gunakan hostname/port publik yang diberikan Railway.

Firmware harus memakai MQTT melalui TLS, mempercayai CA yang sesuai dan memverifikasi hostname; jangan memakai `setInsecure`. Bila memakai CA privat, distribusikan CA ke firmware melalui konfigurasi privat. Uji sertifikat, waktu/NTP, reconnect dan perpanjangan sertifikat sebelum pengamatan. Paket ini tidak mengklaim firmware existing sudah mendukung endpoint cloud. Pemilihan sertifikat/hostname dan uji TLS publik masih perlu dilakukan pada service sesungguhnya.

ESP lama masih menunjuk broker laptop; hotspot sama tidak mengganti alamat MQTT yang dikompilasi. Flash satu per satu saat board tersedia, verifikasi UID/channel, waktuUTC, mapping, ingest/deduplikasi dan histori; jangan flash semua sekaligus atau mengaktifkan relay pada proses deploy dasar.

## Rujukan platform

[Projects](https://docs.railway.com/projects), [PostgreSQL](https://docs.railway.com/databases/postgresql), [Variables](https://docs.railway.com/variables), [Config as Code](https://docs.railway.com/config-as-code/reference), [Pre-deploy](https://docs.railway.com/deployments/pre-deploy-command), [TCP Proxy](https://docs.railway.com/networking/tcp-proxy).
