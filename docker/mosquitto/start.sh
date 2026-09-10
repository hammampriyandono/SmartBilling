#!/bin/sh
set -eu
# Password dibaca dari secret, tidak ditulis sebagai argumen shell atau log.
umask 077
printf 'smartbilling_dev:%s\n' "$(cat /run/secrets/mqtt_password)" > /tmp/a05-passwords
mosquitto_passwd -U /tmp/a05-passwords
chown mosquitto:mosquitto /tmp/a05-passwords /mosquitto/data
chmod 600 /tmp/a05-passwords
exec /usr/sbin/mosquitto -c /mosquitto/config/mosquitto.conf
