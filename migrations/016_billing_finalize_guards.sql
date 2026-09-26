CREATE FUNCTION validate_billing_finalize() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status='finalized' AND OLD.status<>'finalized' THEN
  IF NEW.source<>'production' THEN RAISE EXCEPTION 'simulation billing cannot be finalized'; END IF;
  IF EXISTS(SELECT 1 FROM room_bills WHERE billing_period_id=NEW.id AND status<>'finalized') OR
    NOT EXISTS(SELECT 1 FROM room_bills WHERE billing_period_id=NEW.id) THEN RAISE EXCEPTION 'all room bills must be finalized'; END IF;
  IF NEW.total_cost_rp IS NULL OR NEW.total_cost_rp<>(SELECT COALESCE(sum(total_cost_rp),0) FROM room_bills WHERE billing_period_id=NEW.id) THEN RAISE EXCEPTION 'billing total invariant failed'; END IF;
 END IF;
 IF OLD.status='finalized' AND NEW.status='superseded' THEN RETURN NEW; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER billing_finalize_valid BEFORE UPDATE ON billing_periods FOR EACH ROW EXECUTE FUNCTION validate_billing_finalize();
