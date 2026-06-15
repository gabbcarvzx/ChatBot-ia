ALTER TABLE tenants
  ALTER COLUMN business_whatsapp DROP NOT NULL;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS owner_name TEXT;

UPDATE users
SET owner_name = 'Owner'
WHERE owner_name IS NULL;

ALTER TABLE users
  ALTER COLUMN owner_name SET NOT NULL;
