CREATE TABLE device_quality_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 property_id uuid REFERENCES properties(id) ON DELETE RESTRICT,
 device_id uuid REFERENCES devices(id) ON DELETE RESTRICT,
 meter_id uuid REFERENCES meters(id) ON DELETE RESTRICT,
 reason varchar(80) NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT now(),
 details jsonb NOT NULL DEFAULT '{}'::jsonb,
 CHECK((device_id IS NULL AND property_id IS NULL) OR property_id IS NOT NULL)
);
CREATE INDEX device_quality_property_time ON device_quality_events(property_id,occurred_at,id);
CREATE INDEX device_quality_device_time ON device_quality_events(device_id,occurred_at,id);

CREATE TABLE device_alert_reviews (
 alert_key varchar(240) PRIMARY KEY,
 property_id uuid NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
 reviewed_at timestamptz NOT NULL DEFAULT now(),
 reviewed_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 note text NOT NULL CHECK(length(note) BETWEEN 1 AND 500),
 row_version integer NOT NULL DEFAULT 1 CHECK(row_version>0),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX device_alert_review_property ON device_alert_reviews(property_id,reviewed_at);

CREATE FUNCTION protect_device_quality_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'device quality event is append-only'; END $$;
CREATE TRIGGER device_quality_event_immutable BEFORE UPDATE OR DELETE ON device_quality_events
FOR EACH ROW EXECUTE FUNCTION protect_device_quality_event();
CREATE TRIGGER device_alert_review_no_delete BEFORE DELETE ON device_alert_reviews
FOR EACH ROW EXECUTE FUNCTION protect_master_delete();
