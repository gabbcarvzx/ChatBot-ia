function mapCatalogItem(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    itemType: row.item_type,
    name: row.name,
    description: row.description,
    priceCents: row.price_cents,
    isAvailable: row.is_available,
    metadata: row.metadata,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
  };
}

export function createCatalogItemRepository({ pool }) {
  return {
    async create(client, item) {
      const executor = client ?? pool;
      const { rows } = await executor.query(
        `
          INSERT INTO catalog_items (
            id, tenant_id, item_type, name, description, price_cents, is_available, metadata
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
          RETURNING
            id, tenant_id, item_type, name, description, price_cents, is_available, metadata, created_at
        `,
        [
          item.id,
          item.tenantId,
          item.itemType,
          item.name,
          item.description,
          item.priceCents,
          item.isAvailable,
          JSON.stringify(item.metadata ?? {}),
        ],
      );

      return mapCatalogItem(rows[0]);
    },

    async listByTenantId(tenantId) {
      const { rows } = await pool.query(
        `
          SELECT
            id, tenant_id, item_type, name, description, price_cents, is_available, metadata, created_at
          FROM catalog_items
          WHERE tenant_id = $1
          ORDER BY created_at ASC
        `,
        [tenantId],
      );

      return rows.map(mapCatalogItem);
    },
  };
}
