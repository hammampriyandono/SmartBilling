CREATE TABLE property_tenants (
 id uuid PRIMARY KEY, property_id uuid NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 status varchar(16) NOT NULL CHECK(status IN ('invited','active','ended')),
 source varchar(16) NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','simulation')),
 created_at timestamptz NOT NULL DEFAULT now(), ended_at timestamptz,
 row_version integer NOT NULL DEFAULT 1 CHECK(row_version>0), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(property_id,user_id), UNIQUE(id,property_id), CHECK(ended_at IS NULL OR status='ended')
);
CREATE INDEX property_tenants_user ON property_tenants(user_id,status);
CREATE TABLE tenant_invitations (
 id uuid PRIMARY KEY, property_tenant_id uuid NOT NULL REFERENCES property_tenants(id) ON DELETE RESTRICT,
 token_sha256 char(64) NOT NULL UNIQUE, expires_at timestamptz NOT NULL,
 used_at timestamptz, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(expires_at>created_at), CHECK(NOT(used_at IS NOT NULL AND revoked_at IS NOT NULL))
);
CREATE FUNCTION validate_property_tenant() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND role='tenant') THEN RAISE EXCEPTION 'membership requires tenant'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER property_tenant_valid BEFORE INSERT OR UPDATE ON property_tenants FOR EACH ROW EXECUTE FUNCTION validate_property_tenant();
CREATE FUNCTION immutable_invitation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR (NEW.id,NEW.property_tenant_id,NEW.token_sha256,NEW.expires_at,NEW.created_at) IS DISTINCT FROM
  (OLD.id,OLD.property_tenant_id,OLD.token_sha256,OLD.expires_at,OLD.created_at) THEN RAISE EXCEPTION 'invitation identity is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER invitation_history BEFORE UPDATE OR DELETE ON tenant_invitations FOR EACH ROW EXECUTE FUNCTION immutable_invitation();
INSERT INTO property_tenants(id,property_id,user_id,status,source,created_at)
 SELECT md5(o.user_id::text||r.property_id::text)::uuid,r.property_id,o.user_id,
 CASE WHEN bool_or(o.ends_at IS NULL OR o.ends_at>now()) THEN 'active' ELSE 'ended' END,
 CASE WHEN bool_or(o.source='simulation') THEN 'simulation' ELSE 'manual' END,min(o.created_at)
 FROM occupancies o JOIN rooms r ON r.id=o.room_id GROUP BY r.property_id,o.user_id
 ON CONFLICT(property_id,user_id) DO NOTHING;
CREATE TRIGGER property_tenant_no_delete BEFORE DELETE ON property_tenants FOR EACH ROW EXECUTE FUNCTION protect_master_delete();
