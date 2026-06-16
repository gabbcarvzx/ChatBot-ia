export function createConversationRepository({ pool }) {
  return {
    async findByTenantAndCustomerPhone(tenantId, customerPhone) {
      const { rows } = await pool.query(
        `
          SELECT
            id,
            tenant_id,
            customer_phone,
            status,
            started_at,
            last_message_at
          FROM conversations
          WHERE tenant_id = $1
            AND customer_phone = $2
          LIMIT 1
        `,
        [tenantId, customerPhone],
      );

      return rows[0] ? mapConversation(rows[0]) : null;
    },

    async create(client, conversation) {
      const executor = client ?? pool;
      const { rows } = await executor.query(
        `
          INSERT INTO conversations (
            id,
            tenant_id,
            customer_phone,
            status,
            started_at,
            last_message_at
          ) VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING
            id,
            tenant_id,
            customer_phone,
            status,
            started_at,
            last_message_at
        `,
        [
          conversation.id,
          conversation.tenantId,
          conversation.customerPhone,
          conversation.status,
          conversation.startedAt,
          conversation.lastMessageAt,
        ],
      );

      return mapConversation(rows[0]);
    },

    async touchLastMessageAt(client, tenantId, conversationId, occurredAt) {
      const executor = client ?? pool;
      const { rows } = await executor.query(
        `
          UPDATE conversations
          SET last_message_at = $3
          WHERE tenant_id = $1
            AND id = $2
          RETURNING
            id,
            tenant_id,
            customer_phone,
            status,
            started_at,
            last_message_at
        `,
        [tenantId, conversationId, occurredAt],
      );

      return rows[0] ? mapConversation(rows[0]) : null;
    },
  };
}

function mapConversation(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    customerPhone: row.customer_phone,
    status: row.status,
    startedAt: row.started_at?.toISOString?.() ?? row.started_at,
    lastMessageAt: row.last_message_at?.toISOString?.() ?? row.last_message_at,
  };
}
