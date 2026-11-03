-- An independently powered demonstration meter is not a downstream branch of
-- the property's main meter. Existing installations keep their original scope.
ALTER TABLE meters ADD COLUMN main_meter_coverage text NOT NULL DEFAULT 'included'
 CHECK (main_meter_coverage IN ('included','outside'));
ALTER TABLE meters ADD CONSTRAINT outside_main_is_communal
 CHECK (main_meter_coverage='included' OR kind='communal');

CREATE FUNCTION immutable_meter_coverage() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.main_meter_coverage IS DISTINCT FROM OLD.main_meter_coverage THEN
  RAISE EXCEPTION 'meter coverage is immutable; retire and create installation';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER meter_coverage_history BEFORE UPDATE ON meters
 FOR EACH ROW EXECUTE FUNCTION immutable_meter_coverage();
