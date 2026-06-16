export function createMessageRepository({ pool }) {
  return {
    async create(client, message) {
      const executor = client ?? pool;
      const { rows } = await executor.query(
        `
          INSERT INTO messages (
            id,
            tenant_id,
            conversation_id,
            direction,
            provider_message_id,
            content,
            created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING
            id,
            tenant_id,
            conversation_id,
            direction,
            provider_message_id,
            content,
            created_at
        `,
        [
          message.id,
          message.tenantId,
          message.conversationId,
          message.direction,
          message.providerMessageId,
          message.content,
          message.createdAt,
        ],
      );

      return mapMessage(rows[0]);
    },
  };
}

function mapMessage(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    conversationId: row.conversation_id,
    direction: row.direction,
    providerMessageId: row.provider_message_id,
    content: row.content,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
  };
}
