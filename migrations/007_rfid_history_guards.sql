-- Application updates only inbox outcome, session closure/review, and reconciled energy.
CREATE FUNCTION protect_rfid_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'RFID history cannot be deleted'; END IF;
 IF TG_TABLE_NAME='device_events' AND
  (NEW.id,NEW.device_id,NEW.boot_id,NEW.sequence_no,NEW.event_type,NEW.occurred_at,NEW.received_at,NEW.payload,NEW.payload_sha256,NEW.previous_boot_id,NEW.previous_sequence_no)
  IS DISTINCT FROM
  (OLD.id,OLD.device_id,OLD.boot_id,OLD.sequence_no,OLD.event_type,OLD.occurred_at,OLD.received_at,OLD.payload,OLD.payload_sha256,OLD.previous_boot_id,OLD.previous_sequence_no)
 THEN RAISE EXCEPTION 'event identity and payload are immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER event_history BEFORE UPDATE OR DELETE ON device_events FOR EACH ROW EXECUTE FUNCTION protect_rfid_history();
CREATE FUNCTION protect_usage_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'session history cannot be deleted'; END IF;
 IF (NEW.id,NEW.communal_load_id,NEW.meter_id,NEW.device_session_key,NEW.start_event_id,NEW.started_at)
 IS DISTINCT FROM (OLD.id,OLD.communal_load_id,OLD.meter_id,OLD.device_session_key,OLD.start_event_id,OLD.started_at)
 OR (OLD.ended_at IS NOT NULL AND (NEW.ended_at,NEW.end_event_id) IS DISTINCT FROM (OLD.ended_at,OLD.end_event_id))
 THEN RAISE EXCEPTION 'session identity and closed boundaries are immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER usage_identity BEFORE UPDATE OR DELETE ON usage_sessions FOR EACH ROW EXECUTE FUNCTION protect_usage_identity();
CREATE FUNCTION immutable_participant() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'session participant is immutable'; END $$;
CREATE TRIGGER participant_history BEFORE UPDATE OR DELETE ON session_participants FOR EACH ROW EXECUTE FUNCTION immutable_participant();
CREATE FUNCTION protect_rfid_context() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='communal_loads' THEN
  IF EXISTS(SELECT 1 FROM usage_sessions WHERE communal_load_id=OLD.id) AND
   (NEW.id,NEW.property_id,NEW.load_type) IS DISTINCT FROM (OLD.id,OLD.property_id,OLD.load_type)
  THEN RAISE EXCEPTION 'facility change would rewrite RFID history'; END IF;
 ELSIF TG_TABLE_NAME='meters' THEN
  IF EXISTS(SELECT 1 FROM usage_sessions WHERE meter_id=OLD.id AND
   (NOT tstzrange(NEW.installed_at,NEW.retired_at,'[)') @> started_at OR
    (ended_at IS NOT NULL AND NOT tstzrange(NEW.installed_at,NEW.retired_at,'[)') @> ended_at)))
  THEN RAISE EXCEPTION 'meter lifetime would rewrite session history'; END IF;
 ELSIF TG_TABLE_NAME='users' THEN
  IF NEW.role<>'tenant' AND EXISTS(SELECT 1 FROM rfid_cards WHERE user_id=OLD.id)
  THEN RAISE EXCEPTION 'card holder must remain tenant'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER facility_rfid_context BEFORE UPDATE ON communal_loads FOR EACH ROW EXECUTE FUNCTION protect_rfid_context();
CREATE TRIGGER meter_rfid_context BEFORE UPDATE ON meters FOR EACH ROW EXECUTE FUNCTION protect_rfid_context();
CREATE TRIGGER user_rfid_context BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION protect_rfid_context();
