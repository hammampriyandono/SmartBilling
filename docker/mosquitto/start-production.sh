#!/bin/sh
set -eu
umask 077
# No shell tracing or raw environment output: these values are platform secrets.
fail() { printf '%s\n' 'Konfigurasi broker production tidak valid.' >&2; exit 1; }
valid_uid() {
 case "$1" in ''|*[!A-Za-z0-9_-]*) return 1;; esac
 [ "${#1}" -le 80 ]
}
valid_password() {
 case "$1" in ''|*[!a-fA-F0-9]*) return 1;; esac
 [ "${#1}" -ge 48 ] && [ "${#1}" -le 128 ]
}
backend=${MQTT_BACKEND_USERNAME:-}
valid_uid "$backend" || fail
valid_password "${MQTT_BACKEND_PASSWORD:-}" || fail
auth_dir=$(mktemp -d /tmp/splitzbill-mqtt.XXXXXX)
trap 'rm -rf "$auth_dir"' EXIT HUP INT TERM
passwords=$auth_dir/passwords
acl=$auth_dir/acl
config=$auth_dir/mosquitto.conf
printf '%s:%s\n' "$backend" "$MQTT_BACKEND_PASSWORD" > "$passwords"
printf '%s\n' "$backend" > "$auth_dir/users"
printf '%s\n' "${MQTT_DEVICE_CREDENTIALS:-}" > "$auth_dir/devices"
{
 printf 'user %s\n' "$backend"
 printf 'topic read smartbilling/v1/devices/+/readings\n'
 printf 'topic read smartbilling/v1/devices/+/rfid/taps\n'
 printf 'topic read smartbilling/v1/devices/+/rfid/status\n'
 printf 'topic write smartbilling/v1/devices/+/rfid/responses\n\n'
} > "$acl"
while IFS='|' read -r uid role password extra; do
 [ -n "$uid$role$password$extra" ] || continue
 valid_uid "$uid" || fail
 valid_password "$password" || fail
 [ -z "$extra" ] || fail
 case "$role" in sensor|rfid|combined) ;; *) fail;; esac
 ! grep -Fqx -- "$uid" "$auth_dir/users" || fail
 printf '%s\n' "$uid" >> "$auth_dir/users"
 printf '%s:%s\n' "$uid" "$password" >> "$passwords"
 printf 'user %s\n' "$uid" >> "$acl"
 if [ "$role" = sensor ] || [ "$role" = combined ]; then
  printf 'topic write smartbilling/v1/devices/%s/readings\ntopic write smartbilling/v1/devices/%s/status\n' "$uid" "$uid" >> "$acl"
 fi
 if [ "$role" = rfid ] || [ "$role" = combined ]; then
  printf 'topic write smartbilling/v1/devices/%s/rfid/taps\ntopic write smartbilling/v1/devices/%s/rfid/status\ntopic read smartbilling/v1/devices/%s/rfid/responses\n' "$uid" "$uid" "$uid" >> "$acl"
 fi
 printf '\n' >> "$acl"
done < "$auth_dir/devices"
mosquitto_passwd -U "$passwords" >/dev/null 2>&1 || fail
rm "$auth_dir/users" "$auth_dir/devices"
cat > "$config" <<CONF
listener 1883
allow_anonymous false
password_file $passwords
acl_file $acl
persistence true
persistence_location /mosquitto/data/
autosave_interval 30
log_dest stdout
log_type warning
log_type error
CONF
# The private listener must never be a public TCP Proxy target. Public devices
# use the TLS listener, enabled only once a matching certificate/key are supplied.
if [ -n "${MQTT_TLS_CERT:-}${MQTT_TLS_KEY:-}" ]; then
 [ -n "${MQTT_TLS_CERT:-}" ] && [ -n "${MQTT_TLS_KEY:-}" ] || fail
 printf '%s\n' "$MQTT_TLS_CERT" > "$auth_dir/server.crt"
 printf '%s\n' "$MQTT_TLS_KEY" > "$auth_dir/server.key"
 cat >> "$config" <<CONF
listener 8883
certfile $auth_dir/server.crt
keyfile $auth_dir/server.key
tls_version tlsv1.2
CONF
fi
mkdir -p /mosquitto/data
chown -R mosquitto:mosquitto "$auth_dir"
chown mosquitto:mosquitto /mosquitto/data
chmod 700 "$auth_dir"
exec /usr/sbin/mosquitto -c "$config"
