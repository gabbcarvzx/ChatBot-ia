function mapFaqItem(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    question: row.question,
    answer: row.answer,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
  };
}

export function createFaqItemRepository({ pool }) {
  return {
    async create(client, item) {
      const executor = client ?? pool;
      const { rows } = await executor.query(
        `
          INSERT INTO faq_items (id, tenant_id, question, answer)
          VALUES ($1, $2, $3, $4)
          RETURNING id, tenant_id, question, answer, created_at
        `,
        [item.id, item.tenantId, item.question, item.answer],
      );

      return mapFaqItem(rows[0]);
    },

    async listByTenantId(tenantId) {
      const { rows } = await pool.query(
        `
          SELECT id, tenant_id, question, answer, created_at
          FROM faq_items
          WHERE tenant_id = $1
          ORDER BY created_at ASC
        `,
        [tenantId],
      );

      return rows.map(mapFaqItem);
    },
  };
}
