ALTER TABLE properties
 ADD COLUMN row_version integer NOT NULL DEFAULT 1 CHECK(row_version>0),
 ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
