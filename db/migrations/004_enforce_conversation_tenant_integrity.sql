ALTER TABLE conversations
  ADD CONSTRAINT conversations_tenant_id_id_key UNIQUE (tenant_id, id);

ALTER TABLE messages
  DROP CONSTRAINT IF EXISTS messages_conversation_id_fkey;

ALTER TABLE messages
  ADD CONSTRAINT messages_tenant_conversation_fkey
  FOREIGN KEY (tenant_id, conversation_id)
  REFERENCES conversations(tenant_id, id)
  ON DELETE CASCADE;

ALTER TABLE leads
  DROP CONSTRAINT IF EXISTS leads_conversation_id_fkey;

ALTER TABLE leads
  ADD CONSTRAINT leads_tenant_conversation_fkey
  FOREIGN KEY (tenant_id, conversation_id)
  REFERENCES conversations(tenant_id, id)
  ON DELETE CASCADE;

ALTER TABLE pre_appointments
  DROP CONSTRAINT IF EXISTS pre_appointments_conversation_id_fkey;

ALTER TABLE pre_appointments
  ADD CONSTRAINT pre_appointments_tenant_conversation_fkey
  FOREIGN KEY (tenant_id, conversation_id)
  REFERENCES conversations(tenant_id, id)
  ON DELETE CASCADE;
