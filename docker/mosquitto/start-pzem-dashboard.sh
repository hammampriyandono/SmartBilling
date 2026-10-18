#!/bin/sh
set -eu
umask 077
uid=${PZEM_DASHBOARD_UID:?missing device UID}
case "$uid" in ''|*[!A-Za-z0-9_-]*) exit 1;; esac
[ "${#uid}" -le 80 ] && [ "$uid" != smartbilling_dev ] && [ "$uid" != pzem-dashboard-observer ]
{
 printf 'smartbilling_dev:%s\n' "$(cat /run/secrets/mqtt_password)"
 printf '%s:%s\n' "$uid" "$(cat /run/secrets/pzem_dashboard_device_password)"
 printf 'pzem-dashboard-observer:%s\n' "$(cat /run/secrets/pzem_dashboard_observer_password)"
} > /tmp/pzem-dashboard-passwords
mosquitto_passwd -U /tmp/pzem-dashboard-passwords
{
 printf 'user smartbilling_dev\ntopic read smartbilling/v1/devices/+/readings\ntopic read smartbilling/v1/devices/+/rfid/taps\ntopic write smartbilling/v1/devices/+/rfid/responses\ntopic write smartbilling/dev-check/broker-health\n\n'
 printf 'user %s\ntopic write smartbilling/v1/devices/%s/readings\ntopic write smartbilling/v1/devices/%s/status\n\n' "$uid" "$uid" "$uid"
 printf 'user pzem-dashboard-observer\ntopic read smartbilling/v1/devices/%s/readings\ntopic read smartbilling/v1/devices/%s/status\n' "$uid" "$uid"
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
