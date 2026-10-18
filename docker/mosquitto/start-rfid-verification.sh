#!/bin/sh
set -eu
umask 077
# Only generated disposable test passwords, no physical/team credentials.
printf 'rfid-test-a:%s\nrfid-test-b:%s\n' "$(cat /run/secrets/rfid_test_a_password)" "$(cat /run/secrets/rfid_test_b_password)" > /tmp/rfid-test-passwords
mosquitto_passwd -U /tmp/rfid-test-passwords
export RFID_DEVICE_PASSWORDS_FILE=/tmp/rfid-test-passwords
exec /bin/sh /opt/a05/start-rfid-lan.sh
