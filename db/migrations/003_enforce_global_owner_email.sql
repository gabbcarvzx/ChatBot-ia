DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM users
    GROUP BY email
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot enforce global owner email uniqueness because duplicate emails already exist across tenants.';
  END IF;
END $$;

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_tenant_id_email_key;

ALTER TABLE users
  ADD CONSTRAINT users_email_key UNIQUE (email);
