function mapLead(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    conversationId: row.conversation_id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    interestSummary: row.interest_summary,
    status: row.status,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
  };
}

export function createLeadRepository({ pool }) {
  return {
    async upsertByConversation(client, payload) {
      const executor = client ?? pool;
      const { rows } = await executor.query(
        `
          INSERT INTO leads (
            id,
            tenant_id,
            conversation_id,
            customer_name,
            customer_phone,
            interest_summary,
            status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (tenant_id, conversation_id)
          DO UPDATE SET
            customer_name = EXCLUDED.customer_name,
            customer_phone = EXCLUDED.customer_phone,
            interest_summary = EXCLUDED.interest_summary,
            status = EXCLUDED.status
          RETURNING
            id,
            tenant_id,
            conversation_id,
            customer_name,
            customer_phone,
            interest_summary,
            status,
            created_at
        `,
        [
          payload.id,
          payload.tenantId,
          payload.conversationId,
          payload.customerName,
          payload.customerPhone,
          payload.interestSummary,
          payload.status ?? "new",
        ],
      );

      return mapLead(rows[0]);
    },
  };
}
