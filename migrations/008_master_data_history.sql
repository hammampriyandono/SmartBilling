CREATE TABLE audit_logs (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 property_id uuid NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
 actor_user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
 request_id uuid NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT now(),
 action varchar(64) NOT NULL,
 entity_type varchar(64) NOT NULL,
 entity_id varchar(100) NOT NULL,
 before_data jsonb,
 after_data jsonb,
 reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 500)
);
CREATE INDEX audit_property_time ON audit_logs(property_id,occurred_at,id);
CREATE FUNCTION immutable_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'audit log is append-only'; END $$;
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION immutable_audit();

ALTER TABLE rooms ADD COLUMN source varchar(16) NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','simulation')),
 ADD COLUMN row_version integer NOT NULL DEFAULT 1 CHECK(row_version>0), ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE devices ADD COLUMN display_name varchar(120), ADD COLUMN source varchar(16) NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','simulation')),
 ADD COLUMN deactivated_at timestamptz, ADD COLUMN row_version integer NOT NULL DEFAULT 1 CHECK(row_version>0), ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE communal_loads ADD COLUMN source varchar(16) NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','simulation')),
 ADD COLUMN row_version integer NOT NULL DEFAULT 1 CHECK(row_version>0), ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE occupancies ADD COLUMN source varchar(16) NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','simulation')),
 ADD COLUMN row_version integer NOT NULL DEFAULT 1 CHECK(row_version>0), ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE rfid_cards ADD COLUMN source varchar(16) NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','simulation')),
 ADD COLUMN row_version integer NOT NULL DEFAULT 1 CHECK(row_version>0), ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE rfid_readers ADD COLUMN source varchar(16) NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','simulation')),
 ADD COLUMN row_version integer NOT NULL DEFAULT 1 CHECK(row_version>0), ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE users ADD COLUMN row_version integer NOT NULL DEFAULT 1 CHECK(row_version>0), ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE meter_assets (
 id uuid PRIMARY KEY, property_id uuid NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
 serial_number varchar(100), label varchar(120) NOT NULL, model varchar(100),
 status varchar(16) NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive','retired')),
 source varchar(16) NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','simulation')),
 created_at timestamptz NOT NULL DEFAULT now(), retired_at timestamptz,
 row_version integer NOT NULL DEFAULT 1 CHECK(row_version>0), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,property_id), CHECK(retired_at IS NULL OR retired_at>=created_at)
);
CREATE UNIQUE INDEX meter_asset_serial ON meter_assets(property_id,serial_number) WHERE serial_number IS NOT NULL;
ALTER TABLE meters ADD COLUMN meter_asset_id uuid;
INSERT INTO meter_assets(id,property_id,serial_number,label,source,created_at)
 SELECT id,property_id,serial_number,COALESCE(serial_number,'Meter '||left(id::text,8)),
 CASE WHEN id::text LIKE '00000000-0000-4000-8000-%' THEN 'simulation' ELSE 'manual' END,installed_at FROM meters;
UPDATE meters SET meter_asset_id=id;
ALTER TABLE meters ALTER COLUMN meter_asset_id SET NOT NULL,
 ADD FOREIGN KEY(meter_asset_id,property_id) REFERENCES meter_assets(id,property_id) ON DELETE RESTRICT,
 ADD COLUMN source varchar(16) NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','simulation')),
 ADD COLUMN row_version integer NOT NULL DEFAULT 1 CHECK(row_version>0), ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX meter_asset_installations ON meters(meter_asset_id,installed_at);
ALTER TABLE meters ADD CONSTRAINT meter_asset_installation_no_overlap EXCLUDE USING gist
 (meter_asset_id WITH =,tstzrange(installed_at,retired_at,'[)') WITH &&);

UPDATE rooms SET source='simulation' WHERE id::text LIKE '00000000-0000-4000-8000-%';
UPDATE devices SET source='simulation' WHERE device_uid LIKE 'sim-%';
UPDATE communal_loads SET source='simulation' WHERE id::text LIKE '00000000-0000-4000-8000-%';
UPDATE occupancies SET source='simulation' WHERE user_id::text LIKE '00000000-0000-4000-8000-%';
UPDATE rfid_cards SET source='simulation' WHERE id::text LIKE '00000000-0000-4000-8000-%';
UPDATE rfid_readers SET source='simulation' WHERE id::text LIKE '00000000-0000-4000-8000-%';
UPDATE meters SET source='simulation' WHERE id::text LIKE '00000000-0000-4000-8000-%';

CREATE FUNCTION protect_master_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='devices' AND EXISTS(SELECT 1 FROM meters WHERE device_id=OLD.id UNION ALL SELECT 1 FROM device_events WHERE device_id=OLD.id UNION ALL SELECT 1 FROM rfid_readers WHERE device_id=OLD.id)
  AND (NEW.id,NEW.property_id,NEW.device_uid) IS DISTINCT FROM (OLD.id,OLD.property_id,OLD.device_uid) THEN RAISE EXCEPTION 'device identity is historical'; END IF;
 IF TG_TABLE_NAME='rooms' AND EXISTS(SELECT 1 FROM occupancies WHERE room_id=OLD.id UNION ALL SELECT 1 FROM meters WHERE room_id=OLD.id)
  AND (NEW.id,NEW.property_id,NEW.code,NEW.active_from) IS DISTINCT FROM (OLD.id,OLD.property_id,OLD.code,OLD.active_from) THEN RAISE EXCEPTION 'room identity is historical'; END IF;
 IF TG_TABLE_NAME='meter_assets' AND EXISTS(SELECT 1 FROM meters WHERE meter_asset_id=OLD.id)
  AND (NEW.id,NEW.property_id,NEW.serial_number) IS DISTINCT FROM (OLD.id,OLD.property_id,OLD.serial_number) THEN RAISE EXCEPTION 'meter asset identity is historical'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER device_master_guard BEFORE UPDATE ON devices FOR EACH ROW EXECUTE FUNCTION protect_master_identity();
CREATE TRIGGER room_master_guard BEFORE UPDATE ON rooms FOR EACH ROW EXECUTE FUNCTION protect_master_identity();
CREATE TRIGGER meter_asset_master_guard BEFORE UPDATE ON meter_assets FOR EACH ROW EXECUTE FUNCTION protect_master_identity();

CREATE FUNCTION protect_master_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'master data cannot be deleted'; END $$;
CREATE TRIGGER device_no_delete BEFORE DELETE ON devices FOR EACH ROW EXECUTE FUNCTION protect_master_delete();
CREATE TRIGGER room_no_delete BEFORE DELETE ON rooms FOR EACH ROW EXECUTE FUNCTION protect_master_delete();
CREATE TRIGGER meter_asset_no_delete BEFORE DELETE ON meter_assets FOR EACH ROW EXECUTE FUNCTION protect_master_delete();
CREATE TRIGGER facility_no_delete BEFORE DELETE ON communal_loads FOR EACH ROW EXECUTE FUNCTION protect_master_delete();
CREATE TRIGGER occupancy_no_delete BEFORE DELETE ON occupancies FOR EACH ROW EXECUTE FUNCTION protect_master_delete();
CREATE TRIGGER card_no_delete BEFORE DELETE ON rfid_cards FOR EACH ROW EXECUTE FUNCTION protect_master_delete();
CREATE TRIGGER reader_no_delete BEFORE DELETE ON rfid_readers FOR EACH ROW EXECUTE FUNCTION protect_master_delete();
CREATE TRIGGER meter_no_delete BEFORE DELETE ON meters FOR EACH ROW EXECUTE FUNCTION protect_master_delete();
