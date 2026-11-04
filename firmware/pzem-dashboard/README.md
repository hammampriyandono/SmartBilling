# Monitoring meter PZEM

Sketch ini membaca sensor dan mengirim data; tidak menambahkan kontrol relay.
Konfigurasi operasional per perangkat disimpan di header privat di luar Git.

Default `MQTT_USE_TLS=0` mempertahankan broker LAN. Untuk Railway, gunakan1,
hostname/port TLS broker yang benar, akun unik perangkat, dan `MQTT_CA_CERT`
berisi PEM CA yang dipercaya. TLS menunggu NTP, memverifikasi sertifikat/hostname,
dan tidak memiliki fallback plaintext/setInsecure. Profil Wi-Fi rumah/hotspot,
counter kumulatif, antrean NVS, UART20/21 dan sampling menit tetap dipertahankan.
Guard jaringan12detik sebelum sampling untuk TLS; default LAN tetap4detik.

Header mqtt_transport.h sengaja sama dengan sketch relay agar setiap folder
firmware tetap mandiri. `test/pzem-mqtt-transport.test.js` memeriksa kesamaan
transport serta bahwa perubahan source meter hanya menyentuh integrasi jaringan,
tanpa mengubah sensor/payload/state/portal atau menambahkan relay. Perilaku header
TLS/LAN dicakup shim C++ di test/relay-cpp.
