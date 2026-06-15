export function createTenantRepository({ pool }) {
  return {
    async create(client, tenant) {
      const executor = client ?? pool;
      const { rows } = await executor.query(
        `
          INSERT INTO tenants (
            id,
            name,
            slug,
            vertical,
            plan_code,
            subscription_status,
            business_whatsapp
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING
            id,
            name,
            slug,
            vertical,
            plan_code,
            subscription_status,
            business_whatsapp,
            created_at
        `,
        [
          tenant.id,
          tenant.name,
          tenant.slug,
          tenant.vertical,
          tenant.planCode,
          tenant.subscriptionStatus,
          tenant.businessWhatsApp,
        ],
      );

      return mapTenant(rows[0]);
    },

    async findById(id) {
      const { rows } = await pool.query(
        `
          SELECT
            id,
            name,
            slug,
            vertical,
            plan_code,
            subscription_status,
            business_whatsapp,
            created_at
          FROM tenants
          WHERE id = $1
        `,
        [id],
      );

      return rows[0] ? mapTenant(rows[0]) : null;
    },

    async findBySlug(slug) {
      const { rows } = await pool.query(
        `
          SELECT
            id,
            name,
            slug,
            vertical,
            plan_code,
            subscription_status,
            business_whatsapp,
            created_at
          FROM tenants
          WHERE slug = $1
        `,
        [slug],
      );

      return rows[0] ? mapTenant(rows[0]) : null;
    },
  };
}

function mapTenant(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    vertical: row.vertical,
    planCode: row.plan_code,
    subscriptionStatus: row.subscription_status,
    businessWhatsApp: row.business_whatsapp,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
  };
}
