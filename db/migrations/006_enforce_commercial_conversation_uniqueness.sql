DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'uq_leads_tenant_conversation'
      AND connamespace = current_schema()::regnamespace
  ) THEN
    ALTER TABLE leads
    ADD CONSTRAINT uq_leads_tenant_conversation
    UNIQUE (tenant_id, conversation_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'uq_pre_appointments_tenant_conversation'
      AND connamespace = current_schema()::regnamespace
  ) THEN
    ALTER TABLE pre_appointments
    ADD CONSTRAINT uq_pre_appointments_tenant_conversation
    UNIQUE (tenant_id, conversation_id);
  END IF;
END $$;
