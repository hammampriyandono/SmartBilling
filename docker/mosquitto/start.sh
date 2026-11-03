#!/bin/sh
set -eu
# Password dibaca dari secret, tidak ditulis sebagai argumen shell atau log.
umask 077
# Stage a new file so restarts can replace the mosquitto-owned file in /tmp.
passwords=$(mktemp /tmp/a05-passwords.XXXXXX)
trap 'rm -f "$passwords"' EXIT HUP INT TERM
printf 'smartbilling_dev:%s\n' "$(cat /run/secrets/mqtt_password)" > "$passwords"
mosquitto_passwd -U "$passwords"
chown mosquitto:mosquitto "$passwords" /mosquitto/data
chmod 600 "$passwords"
mv -f "$passwords" /tmp/a05-passwords
exec /usr/sbin/mosquitto -c /mosquitto/config/mosquitto.conf
