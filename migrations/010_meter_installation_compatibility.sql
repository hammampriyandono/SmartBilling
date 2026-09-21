-- Existing trusted provisioning/test code creates one installation record directly.
-- Preserve that path while keeping the physical asset explicit for every new row.
CREATE FUNCTION ensure_meter_asset() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.meter_asset_id IS NULL THEN
  INSERT INTO meter_assets(id,property_id,serial_number,label,source,created_at)
   VALUES(NEW.id,NEW.property_id,NEW.serial_number,COALESCE(NEW.serial_number,'Meter '||left(NEW.id::text,8)),NEW.source,NEW.installed_at);
  NEW.meter_asset_id:=NEW.id;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER meter_asset_required BEFORE INSERT ON meters FOR EACH ROW EXECUTE FUNCTION ensure_meter_asset();
