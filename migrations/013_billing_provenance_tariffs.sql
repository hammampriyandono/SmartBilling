ALTER TABLE meter_readings ADD COLUMN data_source varchar(16) NOT NULL DEFAULT 'simulation'
 CHECK(data_source IN ('simulation','production'));
ALTER TABLE device_events ADD COLUMN data_source varchar(16) NOT NULL DEFAULT 'simulation'
 CHECK(data_source IN ('simulation','production'));
ALTER TABLE usage_sessions ADD COLUMN data_source varchar(16) NOT NULL DEFAULT 'simulation'
 CHECK(data_source IN ('simulation','production'));

CREATE TABLE tariff_schedules (
 id uuid PRIMARY KEY, property_id uuid NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
 valid_from timestamptz NOT NULL CHECK(isfinite(valid_from)), valid_until timestamptz CHECK(isfinite(valid_until) AND valid_until>valid_from),
 energy_rate_rp_kwh numeric(24,12) NOT NULL CHECK(energy_rate_rp_kwh>0 AND energy_rate_rp_kwh<'Infinity'::numeric),
 currency char(3) NOT NULL DEFAULT 'IDR' CHECK(currency='IDR'), source_reference varchar(240) NOT NULL,
 source varchar(16) NOT NULL CHECK(source IN ('manual','simulation')), row_version integer NOT NULL DEFAULT 1 CHECK(row_version>0),
 created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at timestamptz NOT NULL DEFAULT now(), retired_at timestamptz,
 CHECK(retired_at IS NULL OR retired_at>=created_at),
 EXCLUDE USING gist(property_id WITH =,tstzrange(valid_from,valid_until,'[)') WITH &&)
);
CREATE INDEX tariff_property_time ON tariff_schedules(property_id,valid_from);
CREATE FUNCTION protect_tariff_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'tariff history cannot be deleted'; END IF;
 IF (NEW.id,NEW.property_id,NEW.valid_from,NEW.valid_until,NEW.energy_rate_rp_kwh,NEW.currency,NEW.source_reference,NEW.source,NEW.created_by,NEW.created_at)
  IS DISTINCT FROM (OLD.id,OLD.property_id,OLD.valid_from,OLD.valid_until,OLD.energy_rate_rp_kwh,OLD.currency,OLD.source_reference,OLD.source,OLD.created_by,OLD.created_at)
 THEN RAISE EXCEPTION 'create a new tariff schedule instead of rewriting history'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tariff_history BEFORE UPDATE OR DELETE ON tariff_schedules FOR EACH ROW EXECUTE FUNCTION protect_tariff_history();

