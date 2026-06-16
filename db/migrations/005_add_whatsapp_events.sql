CREATE TABLE whatsapp_events (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider_event_id TEXT NOT NULL,
  provider_message_id TEXT,
  payload JSONB NOT NULL,
  status TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  UNIQUE (tenant_id, provider_event_id)
);

CREATE INDEX idx_whatsapp_events_tenant_status ON whatsapp_events (tenant_id, status);
