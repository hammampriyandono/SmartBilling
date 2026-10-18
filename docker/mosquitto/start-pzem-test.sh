#!/bin/sh
set -eu
umask 077
# Secrets are read from files, never command-line arguments or logs.
{
  printf 'pzem-kamar2:%s\n' "$(cat /run/secrets/pzem_device_password)"
  printf 'pzem-observer:%s\n' "$(cat /run/secrets/pzem_observer_password)"
} > /tmp/pzem-passwords
mosquitto_passwd -U /tmp/pzem-passwords
chown mosquitto:mosquitto /tmp/pzem-passwords
chmod 600 /tmp/pzem-passwords
exec /usr/sbin/mosquitto -c /mosquitto/config/pzem-test.conf
