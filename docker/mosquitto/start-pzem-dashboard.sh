#!/bin/sh
set -eu
umask 077
uid=${PZEM_DASHBOARD_UID:?missing device UID}
case "$uid" in ''|*[!A-Za-z0-9_-]*) exit 1;; esac
[ "${#uid}" -le 80 ]
[ "$uid" != smartbilling_dev ]
[ "$uid" != pzem-dashboard-observer ]
extra_dir=${PZEM_DASHBOARD_EXTRA_DEVICES_DIR:-/run/pzem-extra-devices}
rfid_dir=${RFID_DASHBOARD_DEVICES_DIR:-/run/rfid-dashboard-devices}
combo_uid=${RFID_PZEM_UID:-}
case "$combo_uid" in *[!A-Za-z0-9_-]*) exit 1;; esac
[ "${#combo_uid}" -le 80 ]
extra_combo_uid=${RFID_PZEM_EXTRA_UID:-}
case "$extra_combo_uid" in *[!A-Za-z0-9_-]*) exit 1;; esac
[ "${#extra_combo_uid}" -le 80 ]
relay_uid=${ROOM_RELAY_DEVICE_UID:-}
case "$relay_uid" in *[!A-Za-z0-9_-]*) exit 1;; esac
[ "${#relay_uid}" -le 80 ]
primary_password=$(cat /run/secrets/pzem_dashboard_device_password)
# Stage generated files before replacing mosquitto-owned paths on a restart.
passwords=$(mktemp /tmp/pzem-dashboard-passwords.XXXXXX)
acl=$(mktemp /tmp/pzem-dashboard-acl.XXXXXX)
config=$(mktemp /tmp/pzem-dashboard.conf.XXXXXX)
extra_uids=$(mktemp /tmp/pzem-dashboard-extra-uids.XXXXXX)
rfid_uids=$(mktemp /tmp/rfid-dashboard-uids.XXXXXX)
trap 'rm -f "$passwords" "$acl" "$config" "$extra_uids" "$rfid_uids"' EXIT HUP INT TERM
{
 printf 'smartbilling_dev:%s\n' "$(cat /run/secrets/mqtt_password)"
 printf '%s:%s\n' "$uid" "$primary_password"
 printf 'pzem-dashboard-observer:%s\n' "$(cat /run/secrets/pzem_dashboard_observer_password)"
} > "$passwords"
for file in "$extra_dir"/*; do
 [ -f "$file" ] || continue
 [ ! -L "$file" ]
 extra_uid=$(basename "$file")
 case "$extra_uid" in ''|*[!A-Za-z0-9_-]*) exit 1;; esac
 [ "${#extra_uid}" -le 80 ]
 [ "$extra_uid" != "$uid" ]
 [ "$extra_uid" != smartbilling_dev ]
 [ "$extra_uid" != pzem-dashboard-observer ]
 extra_password=$(cat "$file")
 case "$extra_password" in ''|*[!a-f0-9]*) exit 1;; esac
 [ "${#extra_password}" -eq 48 ]
 [ "$extra_password" != "$primary_password" ]
 printf '%s:%s\n' "$extra_uid" "$extra_password" >> "$passwords"
 printf '%s\n' "$extra_uid" >> "$extra_uids"
done
for file in "$rfid_dir"/*; do
 [ -f "$file" ] || continue
 [ ! -L "$file" ]
 rfid_uid=$(basename "$file")
 case "$rfid_uid" in ''|*[!A-Za-z0-9_-]*) exit 1;; esac
 [ "${#rfid_uid}" -le 80 ]
 [ "$rfid_uid" != "$uid" ]
 [ "$rfid_uid" != smartbilling_dev ]
 [ "$rfid_uid" != pzem-dashboard-observer ]
 ! grep -Fqx -- "$rfid_uid" "$extra_uids"
 rfid_password=$(cat "$file")
 case "$rfid_password" in ''|*[!a-f0-9]*) exit 1;; esac
 [ "${#rfid_password}" -eq 48 ]
 [ "$rfid_password" != "$primary_password" ]
 printf '%s:%s\n' "$rfid_uid" "$rfid_password" >> "$passwords"
 printf '%s\n' "$rfid_uid" >> "$rfid_uids"
done
if [ -n "$combo_uid" ]; then grep -Fqx -- "$combo_uid" "$rfid_uids"; fi
if [ -n "$extra_combo_uid" ]; then grep -Fqx -- "$extra_combo_uid" "$rfid_uids"; fi
# Relay access requires a provisioned PZEM account or an explicitly configured
# combined PZEM account. An ordinary RFID reader never gains control rights.
if [ -n "$relay_uid" ]; then
 if [ "$relay_uid" != "$uid" ] && ! grep -Fqx -- "$relay_uid" "$extra_uids"; then
  # Explicitly provisioned combined PZEM/RFID account may be reused by its
  # physical spare board for PZEM+relay trials. Ordinary RFID accounts denied.
  { [ "$relay_uid" = "$combo_uid" ] || [ "$relay_uid" = "$extra_combo_uid" ]; }
  grep -Fqx -- "$relay_uid" "$rfid_uids"
 fi
fi
mosquitto_passwd -U "$passwords"
{
 printf 'user smartbilling_dev\ntopic read smartbilling/v1/devices/+/readings\ntopic read smartbilling/v1/devices/+/rfid/taps\ntopic read smartbilling/v1/devices/+/rfid/status\ntopic write smartbilling/v1/devices/+/rfid/responses\ntopic write smartbilling/dev-check/broker-health\n\n'
 if [ -n "$relay_uid" ]; then
  printf 'user smartbilling_dev\ntopic read smartbilling/v1/devices/%s/relay/status\ntopic write smartbilling/v1/devices/%s/relay/commands\n\n' "$relay_uid" "$relay_uid"
  printf 'user %s\ntopic read smartbilling/v1/devices/%s/relay/commands\ntopic write smartbilling/v1/devices/%s/relay/status\n\n' "$relay_uid" "$relay_uid" "$relay_uid"
 fi
 printf 'user %s\ntopic write smartbilling/v1/devices/%s/readings\ntopic write smartbilling/v1/devices/%s/status\n\n' "$uid" "$uid" "$uid"
 while IFS= read -r extra_uid; do
  printf 'user %s\ntopic write smartbilling/v1/devices/%s/readings\ntopic write smartbilling/v1/devices/%s/status\n\n' "$extra_uid" "$extra_uid" "$extra_uid"
 done < "$extra_uids"
 while IFS= read -r rfid_uid; do
  printf 'user %s\ntopic write smartbilling/v1/devices/%s/rfid/taps\ntopic write smartbilling/v1/devices/%s/rfid/status\ntopic read smartbilling/v1/devices/%s/rfid/responses\n\n' "$rfid_uid" "$rfid_uid" "$rfid_uid" "$rfid_uid"
  if [ "$rfid_uid" = "$combo_uid" ] || [ "$rfid_uid" = "$extra_combo_uid" ]; then
   printf 'topic write smartbilling/v1/devices/%s/readings\ntopic write smartbilling/v1/devices/%s/status\n\n' "$rfid_uid" "$rfid_uid"
  fi
 done < "$rfid_uids"
 printf 'user pzem-dashboard-observer\ntopic read smartbilling/v1/devices/%s/readings\ntopic read smartbilling/v1/devices/%s/status\n' "$uid" "$uid"
 if [ -n "$combo_uid" ]; then
  printf 'topic read smartbilling/v1/devices/%s/readings\ntopic read smartbilling/v1/devices/%s/status\n' "$combo_uid" "$combo_uid"
 fi
 if [ -n "$extra_combo_uid" ]; then
  printf 'topic read smartbilling/v1/devices/%s/readings\ntopic read smartbilling/v1/devices/%s/status\n' "$extra_combo_uid" "$extra_combo_uid"
 fi
 while IFS= read -r extra_uid; do
  printf 'topic read smartbilling/v1/devices/%s/readings\ntopic read smartbilling/v1/devices/%s/status\n' "$extra_uid" "$extra_uid"
 done < "$extra_uids"
} > "$acl"
cat > "$config" <<'CONF'
listener 1883
allow_anonymous false
password_file /tmp/pzem-dashboard-passwords
acl_file /tmp/pzem-dashboard-acl
persistence true
persistence_location /mosquitto/data/
autosave_interval 30
log_dest stdout
log_type warning
log_type error
CONF
chown mosquitto:mosquitto "$passwords" "$acl" "$config" /mosquitto/data
chmod 600 "$passwords" "$acl" "$config"
mv -f "$passwords" /tmp/pzem-dashboard-passwords
mv -f "$acl" /tmp/pzem-dashboard-acl
mv -f "$config" /tmp/pzem-dashboard.conf
rm -f "$extra_uids" "$rfid_uids"
exec /usr/sbin/mosquitto -c /tmp/pzem-dashboard.conf
