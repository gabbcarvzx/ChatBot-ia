export function createWhatsappEventRepository({ pool }) {
  return {
    async findByTenantAndProviderEventId(tenantId, providerEventId) {
      const { rows } = await pool.query(
        `
          SELECT
            id,
            tenant_id,
            provider_event_id,
            provider_message_id,
            payload,
            status,
            received_at,
            processed_at
          FROM whatsapp_events
          WHERE tenant_id = $1
            AND provider_event_id = $2
          LIMIT 1
        `,
        [tenantId, providerEventId],
      );

      return rows[0] ? mapWhatsappEvent(rows[0]) : null;
    },

    async create(client, event) {
      const executor = client ?? pool;
      const { rows } = await executor.query(
        `
          INSERT INTO whatsapp_events (
            id,
            tenant_id,
            provider_event_id,
            provider_message_id,
            payload,
            status,
            received_at,
            processed_at
          ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
          RETURNING
            id,
            tenant_id,
            provider_event_id,
            provider_message_id,
            payload,
            status,
            received_at,
            processed_at
        `,
        [
          event.id,
          event.tenantId,
          event.providerEventId,
          event.providerMessageId,
          JSON.stringify(event.payload),
          event.status,
          event.receivedAt,
          event.processedAt,
        ],
      );

      return mapWhatsappEvent(rows[0]);
    },

    async markProcessed(client, tenantId, providerEventId) {
      const executor = client ?? pool;
      const { rows } = await executor.query(
        `
          UPDATE whatsapp_events
          SET
            status = 'processed',
            processed_at = NOW()
          WHERE tenant_id = $1
            AND provider_event_id = $2
          RETURNING
            id,
            tenant_id,
            provider_event_id,
            provider_message_id,
            payload,
            status,
            received_at,
            processed_at
        `,
        [tenantId, providerEventId],
      );

      return rows[0] ? mapWhatsappEvent(rows[0]) : null;
    },
  };
}

function mapWhatsappEvent(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    providerEventId: row.provider_event_id,
    providerMessageId: row.provider_message_id,
    payload: row.payload,
    status: row.status,
    receivedAt: row.received_at?.toISOString?.() ?? row.received_at,
    processedAt: row.processed_at?.toISOString?.() ?? row.processed_at,
  };
}
