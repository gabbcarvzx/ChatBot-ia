function mapHour(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    weekday: row.weekday,
    opensAt: row.opens_at,
    closesAt: row.closes_at,
    isClosed: row.is_closed,
  };
}

export function createBusinessHoursRepository({ pool }) {
  return {
    async listByTenantId(tenantId) {
      const { rows } = await pool.query(
        `
          SELECT id, tenant_id, weekday, opens_at, closes_at, is_closed
          FROM business_hours
          WHERE tenant_id = $1
          ORDER BY weekday ASC
        `,
        [tenantId],
      );

      return rows.map(mapHour);
    },

    async replaceForTenant(client, tenantId, hours) {
      await client.query("DELETE FROM business_hours WHERE tenant_id = $1", [tenantId]);

      for (const hour of hours) {
        await client.query(
          `
            INSERT INTO business_hours (
              id, tenant_id, weekday, opens_at, closes_at, is_closed
            ) VALUES ($1, $2, $3, $4, $5, $6)
          `,
          [hour.id, tenantId, hour.weekday, hour.opensAt, hour.closesAt, hour.isClosed],
        );
      }
    },
  };
}
