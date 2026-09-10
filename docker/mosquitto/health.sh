#!/bin/sh
set -eu
mosquitto_pub -h 127.0.0.1 -p 1883 -u smartbilling_dev \
  -P "$(cat /run/secrets/mqtt_password)" \
  -t smartbilling/dev-check/broker-health -m ping -q 1 >/dev/null 2>&1
