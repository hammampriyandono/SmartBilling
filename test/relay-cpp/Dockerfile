FROM node:22-alpine
RUN ["apk", "add", "--no-cache", "g++"]
WORKDIR /test
COPY test/relay-cpp .
COPY firmware/pzem-relay-trial/relay_control.h firmware/pzem-relay-trial/relay_command_guard.h firmware/pzem-relay-trial/diagnostic_serial.h firmware/pzem-relay-trial/pzem_request.h firmware/pzem-relay-trial/mqtt_transport.h ./
RUN ["g++", "-std=c++17", "-Wall", "-Wextra", "-Werror", "-I.", "relay-test.cpp", "-o", "/tmp/relay-test"]
RUN ["g++", "-std=c++17", "-Wall", "-Wextra", "-Werror", "-DROOM_RELAY_ACTIVE_LOW=1", "-I.", "relay-test.cpp", "-o", "/tmp/relay-test-low"]
RUN ["g++", "-std=c++17", "-Wall", "-Wextra", "-Werror", "-I.", "io-test.cpp", "-o", "/tmp/io-test"]
RUN ["g++", "-std=c++17", "-Wall", "-Wextra", "-Werror", "-I.", "transport-test.cpp", "-o", "/tmp/transport-local"]
RUN ["g++", "-std=c++17", "-Wall", "-Wextra", "-Werror", "-DMQTT_USE_TLS=1", "-I.", "transport-test.cpp", "-o", "/tmp/transport-tls"]
CMD ["node", "-e", "const {spawnSync}=require('child_process');for(const file of ['/tmp/relay-test','/tmp/relay-test-low','/tmp/io-test','/tmp/transport-local','/tmp/transport-tls']){const r=spawnSync(file,{stdio:'inherit'});if(r.status)process.exit(r.status);}"]
