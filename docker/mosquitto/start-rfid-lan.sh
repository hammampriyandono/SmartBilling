#!/bin/sh
set -eu
umask 077
# Preserve the existing internal developer account; device credentials are hashes.
printf 'smartbilling_dev:%s\n' "$(cat /run/secrets/mqtt_password)" > /tmp/a05-rfid-base
mosquitto_passwd -U /tmp/a05-rfid-base
device_passwords_file=${RFID_DEVICE_PASSWORDS_FILE:-/run/secrets/rfid_device_passwords}
cat /tmp/a05-rfid-base "$device_passwords_file" > /tmp/a05-rfid-passwords
# Reject malformed username / accidental override of the backend principal.
awk -F: 'NF != 2 || $1 !~ /^[A-Za-z0-9_-]+$/ || length($1)>80 || $1=="smartbilling_dev" || $2 !~ /^\$7\$/ {exit 1}' "$device_passwords_file"
# %u is the authenticated device UID, not a client-provided topic identity.
printf 'user smartbilling_dev\ntopic readwrite #\n\npattern write smartbilling/v1/devices/%%u/rfid/taps\npattern read smartbilling/v1/devices/%%u/rfid/responses\n' > /tmp/a05-rfid-acl
chown mosquitto:mosquitto /tmp/a05-rfid-passwords /tmp/a05-rfid-acl /mosquitto/data
chmod 600 /tmp/a05-rfid-passwords /tmp/a05-rfid-acl
exec /usr/sbin/mosquitto -c /mosquitto/config/rfid-lan.conf
