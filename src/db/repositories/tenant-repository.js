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

    async findByBusinessWhatsApp(businessWhatsApp) {
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
          WHERE business_whatsapp = $1
        `,
        [businessWhatsApp],
      );

      return rows[0] ? mapTenant(rows[0]) : null;
    },

    async updateBillingState(client, tenantId, billingState) {
      const executor = client ?? pool;
      const { rows } = await executor.query(
        `
          UPDATE tenants
          SET
            plan_code = $2,
            subscription_status = $3,
            updated_at = NOW()
          WHERE id = $1
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
        [tenantId, billingState.planCode, billingState.subscriptionStatus],
      );

      return rows[0] ? mapTenant(rows[0]) : null;
    },

    async updateBusinessWhatsApp(client, tenantId, businessWhatsApp) {
      const executor = client ?? pool;
      const { rows } = await executor.query(
        `
          UPDATE tenants
          SET
            business_whatsapp = $2,
            updated_at = NOW()
          WHERE id = $1
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
        [tenantId, businessWhatsApp],
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
