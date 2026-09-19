CREATE TABLE rfid_cards (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 uid varchar(20) NOT NULL CHECK(uid ~ '^([0-9A-F]{8}|[0-9A-F]{14}|[0-9A-F]{20})$'),
 label varchar(100) NOT NULL, registered_at timestamptz NOT NULL CHECK(isfinite(registered_at)),
 revoked_at timestamptz CHECK(isfinite(revoked_at) AND revoked_at>registered_at),
 EXCLUDE USING gist(uid WITH =,tstzrange(registered_at,revoked_at,'[)') WITH &&)
);
CREATE TABLE rfid_readers (
 id uuid PRIMARY KEY, property_id uuid NOT NULL REFERENCES properties(id),
 device_id uuid NOT NULL, reader_channel integer NOT NULL CHECK(reader_channel>=0), communal_load_id uuid NOT NULL,
 active_from timestamptz NOT NULL CHECK(isfinite(active_from)), active_until timestamptz CHECK(isfinite(active_until) AND active_until>active_from),
 FOREIGN KEY(device_id,property_id) REFERENCES devices(id,property_id) ON DELETE RESTRICT,
 FOREIGN KEY(communal_load_id,property_id) REFERENCES communal_loads(id,property_id) ON DELETE RESTRICT,
 EXCLUDE USING gist(device_id WITH =,reader_channel WITH =,tstzrange(active_from,active_until,'[)') WITH &&)
);
CREATE TABLE device_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, device_id uuid NOT NULL REFERENCES devices(id),
 boot_id uuid NOT NULL, sequence_no bigint NOT NULL CHECK(sequence_no BETWEEN 0 AND 9007199254740991),
 event_type varchar(40) NOT NULL CHECK(event_type='rfid_tap'), occurred_at timestamptz NOT NULL CHECK(isfinite(occurred_at)),
 received_at timestamptz NOT NULL DEFAULT now(), payload jsonb NOT NULL, payload_sha256 char(64) NOT NULL,
 previous_boot_id uuid, previous_sequence_no bigint,
 processing_status varchar(24) NOT NULL DEFAULT 'waiting_predecessor' CHECK(processing_status IN ('waiting_predecessor','processed','rejected','review')),
 reason varchar(80), result_action varchar(16) CHECK(result_action IN ('opened','closed')),
 CHECK((previous_boot_id IS NULL)=(previous_sequence_no IS NULL)),
 UNIQUE(device_id,boot_id,sequence_no), UNIQUE(id,device_id)
);
CREATE INDEX rfid_waiting ON device_events(device_id,id) WHERE processing_status='waiting_predecessor';
CREATE TABLE rfid_stream_state (
 device_id uuid PRIMARY KEY REFERENCES devices(id), head_event_id bigint,
 FOREIGN KEY(head_event_id,device_id) REFERENCES device_events(id,device_id)
);
CREATE TABLE usage_sessions (
 id uuid PRIMARY KEY, communal_load_id uuid NOT NULL REFERENCES communal_loads(id), meter_id uuid NOT NULL REFERENCES meters(id),
 device_session_key varchar(160) NOT NULL, start_event_id bigint NOT NULL UNIQUE REFERENCES device_events(id),
 end_event_id bigint UNIQUE REFERENCES device_events(id), started_at timestamptz NOT NULL CHECK(isfinite(started_at)),
 ended_at timestamptz CHECK(isfinite(ended_at) AND ended_at>started_at),
 status varchar(16) NOT NULL CHECK(status IN ('active','completed','review')),
 review_reason varchar(80), energy_status varchar(16) NOT NULL DEFAULT 'unavailable' CHECK(energy_status IN ('unavailable','valid')),
 energy_reason varchar(80), start_reading_id bigint REFERENCES meter_readings(id), end_reading_id bigint REFERENCES meter_readings(id),
 energy_kwh numeric(20,9) CHECK(energy_kwh>=0 AND energy_kwh<'Infinity'::numeric),
 CHECK((ended_at IS NULL)=(end_event_id IS NULL)), CHECK((energy_status='valid')=(energy_kwh IS NOT NULL)),
 CHECK(energy_kwh IS NULL OR (ended_at IS NOT NULL AND start_reading_id IS NOT NULL AND end_reading_id IS NOT NULL)),
 CHECK((ended_at IS NULL AND status IN ('active','review')) OR (ended_at IS NOT NULL AND status='completed')),
 UNIQUE(meter_id,device_session_key)
);
CREATE UNIQUE INDEX one_open_facility_session ON usage_sessions(communal_load_id) WHERE ended_at IS NULL;
CREATE INDEX facility_session_history ON usage_sessions(communal_load_id,started_at,id);
CREATE TABLE session_participants (
 id uuid PRIMARY KEY, usage_session_id uuid NOT NULL UNIQUE REFERENCES usage_sessions(id),
 occupancy_id uuid NOT NULL REFERENCES occupancies(id), rfid_card_id uuid NOT NULL REFERENCES rfid_cards(id),
 registered_at timestamptz NOT NULL
);
CREATE INDEX participant_occupancy ON session_participants(occupancy_id);
CREATE FUNCTION rfid_card_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND (NEW.user_id,NEW.uid,NEW.registered_at) IS DISTINCT FROM (OLD.user_id,OLD.uid,OLD.registered_at) THEN
  RAISE EXCEPTION 'RFID assignment is immutable';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND role='tenant' FOR SHARE) THEN RAISE EXCEPTION 'RFID requires tenant'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER rfid_card_valid BEFORE INSERT OR UPDATE ON rfid_cards FOR EACH ROW EXECUTE FUNCTION rfid_card_history();
CREATE FUNCTION validate_usage_session() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s usage_sessions%ROWTYPE; p session_participants%ROWTYPE; m meters%ROWTYPE; o occupancies%ROWTYPE; c rfid_cards%ROWTYPE; session_id uuid;
BEGIN
 IF TG_TABLE_NAME='usage_sessions' THEN session_id:=NEW.id; ELSE session_id:=NEW.usage_session_id; END IF;
 SELECT * INTO s FROM usage_sessions WHERE id=session_id;
 SELECT * INTO m FROM meters WHERE id=s.meter_id;
 SELECT * INTO p FROM session_participants WHERE usage_session_id=s.id;
 IF NOT FOUND THEN RAISE EXCEPTION 'session requires one participant'; END IF;
 SELECT * INTO o FROM occupancies WHERE id=p.occupancy_id;
 SELECT * INTO c FROM rfid_cards WHERE id=p.rfid_card_id;
 IF m.kind<>'communal' OR m.communal_load_id<>s.communal_load_id OR NOT EXISTS(SELECT 1 FROM communal_loads WHERE id=s.communal_load_id AND load_type='attributable')
  OR o.user_id<>c.user_id OR p.registered_at<>s.started_at
  OR NOT EXISTS(SELECT 1 FROM rooms WHERE id=o.room_id AND property_id=m.property_id)
  OR NOT tstzrange(o.starts_at,o.ends_at,'[)') @> s.started_at
  OR NOT tstzrange(c.registered_at,c.revoked_at,'[)') @> s.started_at THEN RAISE EXCEPTION 'invalid session participant or facility'; END IF;
 IF NOT EXISTS(SELECT 1 FROM device_events WHERE id=s.start_event_id AND occurred_at=s.started_at) THEN RAISE EXCEPTION 'invalid start event'; END IF;
 IF s.ended_at IS NOT NULL AND (NOT tstzrange(o.starts_at,o.ends_at,'[)') @> s.ended_at OR NOT tstzrange(c.registered_at,c.revoked_at,'[)') @> s.ended_at
  OR NOT EXISTS(SELECT 1 FROM device_events WHERE id=s.end_event_id AND occurred_at=s.ended_at)) THEN RAISE EXCEPTION 'invalid end event'; END IF;
 IF EXISTS(SELECT 1 FROM usage_sessions WHERE id<>s.id AND (start_event_id=s.end_event_id OR end_event_id=s.start_event_id)) THEN RAISE EXCEPTION 'event reused'; END IF;
 IF s.energy_kwh IS NOT NULL AND (NOT EXISTS(SELECT 1 FROM meter_readings WHERE id=s.start_reading_id AND meter_id=s.meter_id AND measured_at=s.started_at)
  OR NOT EXISTS(SELECT 1 FROM meter_readings WHERE id=s.end_reading_id AND meter_id=s.meter_id AND measured_at=s.ended_at)) THEN RAISE EXCEPTION 'invalid energy boundary'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER usage_session_valid AFTER INSERT OR UPDATE ON usage_sessions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_usage_session();
CREATE CONSTRAINT TRIGGER participant_valid AFTER INSERT OR UPDATE ON session_participants DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_usage_session();
CREATE FUNCTION protect_rfid_parent() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='rfid_readers' THEN
  IF (NEW.id,NEW.property_id,NEW.device_id,NEW.reader_channel,NEW.communal_load_id,NEW.active_from) IS DISTINCT FROM
     (OLD.id,OLD.property_id,OLD.device_id,OLD.reader_channel,OLD.communal_load_id,OLD.active_from)
   OR EXISTS(SELECT 1 FROM device_events WHERE device_id=OLD.device_id AND (payload->>'reader_channel')::int=OLD.reader_channel
      AND occurred_at>=OLD.active_from AND occurred_at>=NEW.active_until AND (OLD.active_until IS NULL OR occurred_at<OLD.active_until))
  THEN RAISE EXCEPTION 'reader change would rewrite history'; END IF;
 ELSIF TG_TABLE_NAME='occupancies' THEN
  IF EXISTS(SELECT 1 FROM session_participants WHERE occupancy_id=OLD.id) AND NEW IS DISTINCT FROM OLD THEN
   IF (NEW.user_id,NEW.room_id,NEW.starts_at) IS DISTINCT FROM (OLD.user_id,OLD.room_id,OLD.starts_at) OR EXISTS(
    SELECT 1 FROM usage_sessions s JOIN session_participants p ON p.usage_session_id=s.id WHERE p.occupancy_id=OLD.id
    AND (NOT tstzrange(NEW.starts_at,NEW.ends_at,'[)') @> s.started_at OR (s.ended_at IS NOT NULL AND NOT tstzrange(NEW.starts_at,NEW.ends_at,'[)') @> s.ended_at))) THEN RAISE EXCEPTION 'occupancy would rewrite session history'; END IF;
  END IF;
 ELSIF TG_TABLE_NAME='rfid_cards' THEN
  IF EXISTS(SELECT 1 FROM usage_sessions s JOIN session_participants p ON p.usage_session_id=s.id WHERE p.rfid_card_id=OLD.id
    AND (NOT tstzrange(NEW.registered_at,NEW.revoked_at,'[)') @> s.started_at OR (s.ended_at IS NOT NULL AND NOT tstzrange(NEW.registered_at,NEW.revoked_at,'[)') @> s.ended_at))) THEN RAISE EXCEPTION 'revocation would rewrite session history'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER rfid_reader_immutable BEFORE UPDATE ON rfid_readers FOR EACH ROW EXECUTE FUNCTION protect_rfid_parent();
CREATE TRIGGER occupancy_session_history BEFORE UPDATE ON occupancies FOR EACH ROW EXECUTE FUNCTION protect_rfid_parent();
CREATE TRIGGER card_session_history BEFORE UPDATE ON rfid_cards FOR EACH ROW EXECUTE FUNCTION protect_rfid_parent();
CREATE TABLE dev_checks.rfid_simulator (
 device_id uuid PRIMARY KEY REFERENCES devices(id), checkpoint jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
