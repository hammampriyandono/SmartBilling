#!/bin/sh
set -eu
umask 077
uid=${PZEM_DASHBOARD_UID:?missing device UID}
case "$uid" in ''|*[!A-Za-z0-9_-]*) exit 1;; esac
[ "${#uid}" -le 80 ]
[ "$uid" != smartbilling_dev ]
[ "$uid" != pzem-dashboard-observer ]
extra_dir=${PZEM_DASHBOARD_EXTRA_DEVICES_DIR:-/run/pzem-extra-devices}
primary_password=$(cat /run/secrets/pzem_dashboard_device_password)
: > /tmp/pzem-dashboard-extra-uids
{
 printf 'smartbilling_dev:%s\n' "$(cat /run/secrets/mqtt_password)"
 printf '%s:%s\n' "$uid" "$primary_password"
 printf 'pzem-dashboard-observer:%s\n' "$(cat /run/secrets/pzem_dashboard_observer_password)"
} > /tmp/pzem-dashboard-passwords
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
 printf '%s:%s\n' "$extra_uid" "$extra_password" >> /tmp/pzem-dashboard-passwords
 printf '%s\n' "$extra_uid" >> /tmp/pzem-dashboard-extra-uids
done
mosquitto_passwd -U /tmp/pzem-dashboard-passwords
{
 printf 'user smartbilling_dev\ntopic read smartbilling/v1/devices/+/readings\ntopic read smartbilling/v1/devices/+/rfid/taps\ntopic write smartbilling/v1/devices/+/rfid/responses\ntopic write smartbilling/dev-check/broker-health\n\n'
 printf 'user %s\ntopic write smartbilling/v1/devices/%s/readings\ntopic write smartbilling/v1/devices/%s/status\n\n' "$uid" "$uid" "$uid"
 while IFS= read -r extra_uid; do
  printf 'user %s\ntopic write smartbilling/v1/devices/%s/readings\ntopic write smartbilling/v1/devices/%s/status\n\n' "$extra_uid" "$extra_uid" "$extra_uid"
 done < /tmp/pzem-dashboard-extra-uids
 printf 'user pzem-dashboard-observer\ntopic read smartbilling/v1/devices/%s/readings\ntopic read smartbilling/v1/devices/%s/status\n' "$uid" "$uid"
 while IFS= read -r extra_uid; do
  printf 'topic read smartbilling/v1/devices/%s/readings\ntopic read smartbilling/v1/devices/%s/status\n' "$extra_uid" "$extra_uid"
 done < /tmp/pzem-dashboard-extra-uids
} > /tmp/pzem-dashboard-acl
cat > /tmp/pzem-dashboard.conf <<'CONF'
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
chown mosquitto:mosquitto /tmp/pzem-dashboard-passwords /tmp/pzem-dashboard-acl /tmp/pzem-dashboard.conf /mosquitto/data
chmod 600 /tmp/pzem-dashboard-passwords /tmp/pzem-dashboard-acl /tmp/pzem-dashboard.conf
exec /usr/sbin/mosquitto -c /tmp/pzem-dashboard.conf
