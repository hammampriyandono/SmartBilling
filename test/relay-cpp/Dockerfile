FROM node:22-alpine
RUN ["apk", "add", "--no-cache", "g++"]
WORKDIR /test
COPY test/relay-cpp .
COPY firmware/pzem-relay-trial/relay_control.h firmware/pzem-relay-trial/relay_command_guard.h firmware/pzem-relay-trial/diagnostic_serial.h firmware/pzem-relay-trial/pzem_request.h ./
RUN ["g++", "-std=c++17", "-Wall", "-Wextra", "-Werror", "-I.", "relay-test.cpp", "-o", "/tmp/relay-test"]
RUN ["g++", "-std=c++17", "-Wall", "-Wextra", "-Werror", "-DROOM_RELAY_ACTIVE_LOW=1", "-I.", "relay-test.cpp", "-o", "/tmp/relay-test-low"]
RUN ["g++", "-std=c++17", "-Wall", "-Wextra", "-Werror", "-I.", "io-test.cpp", "-o", "/tmp/io-test"]
CMD ["node", "-e", "const {spawnSync}=require('child_process');for(const file of ['/tmp/relay-test','/tmp/relay-test-low','/tmp/io-test']){const r=spawnSync(file,{stdio:'inherit'});if(r.status)process.exit(r.status);}"]
