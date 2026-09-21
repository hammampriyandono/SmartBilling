CREATE OR REPLACE FUNCTION protect_master_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='devices' THEN
  IF EXISTS(SELECT 1 FROM meters WHERE device_id=OLD.id UNION ALL SELECT 1 FROM device_events WHERE device_id=OLD.id UNION ALL SELECT 1 FROM rfid_readers WHERE device_id=OLD.id)
   AND (NEW.id,NEW.property_id,NEW.device_uid) IS DISTINCT FROM (OLD.id,OLD.property_id,OLD.device_uid)
  THEN RAISE EXCEPTION 'device identity is historical'; END IF;
 ELSIF TG_TABLE_NAME='rooms' THEN
  IF EXISTS(SELECT 1 FROM occupancies WHERE room_id=OLD.id UNION ALL SELECT 1 FROM meters WHERE room_id=OLD.id)
   AND (NEW.id,NEW.property_id,NEW.code,NEW.active_from) IS DISTINCT FROM (OLD.id,OLD.property_id,OLD.code,OLD.active_from)
  THEN RAISE EXCEPTION 'room identity is historical'; END IF;
 ELSIF TG_TABLE_NAME='meter_assets' THEN
  IF EXISTS(SELECT 1 FROM meters WHERE meter_asset_id=OLD.id)
   AND (NEW.id,NEW.property_id,NEW.serial_number) IS DISTINCT FROM (OLD.id,OLD.property_id,OLD.serial_number)
  THEN RAISE EXCEPTION 'meter asset identity is historical'; END IF;
 END IF;
 RETURN NEW;
END $$;
