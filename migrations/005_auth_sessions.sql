CREATE TABLE auth_sessions (
  sid varchar NOT NULL PRIMARY KEY,
  sess json NOT NULL,
  expire timestamp(6) NOT NULL
);
CREATE INDEX auth_sessions_expire ON auth_sessions(expire);
