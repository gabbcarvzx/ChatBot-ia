export function createBusinessProfileRepository({ pool }) {
  return {
    async create(client, profile) {
      const executor = client ?? pool;
      const { rows } = await executor.query(
        `
          INSERT INTO business_profiles (
            id,
            tenant_id,
            business_name,
            description,
            location_label,
            full_address,
            payment_methods
          ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
          RETURNING
            id,
            tenant_id,
            business_name,
            description,
            location_label,
            full_address,
            payment_methods
        `,
        [
          profile.id,
          profile.tenantId,
          profile.businessName,
          profile.description,
          profile.locationLabel,
          profile.fullAddress,
          JSON.stringify(profile.paymentMethods ?? []),
        ],
      );

      return mapProfile(rows[0]);
    },

    async findByTenantId(tenantId) {
      const { rows } = await pool.query(
        `
          SELECT
            id,
            tenant_id,
            business_name,
            description,
            location_label,
            full_address,
            payment_methods
          FROM business_profiles
          WHERE tenant_id = $1
        `,
        [tenantId],
      );

      return rows[0] ? mapProfile(rows[0]) : null;
    },

    async updateByTenantId(tenantId, payload) {
      const { rows } = await pool.query(
        `
          UPDATE business_profiles
          SET
            business_name = $2,
            description = $3,
            location_label = $4,
            full_address = $5,
            payment_methods = $6::jsonb,
            updated_at = NOW()
          WHERE tenant_id = $1
          RETURNING
            id,
            tenant_id,
            business_name,
            description,
            location_label,
            full_address,
            payment_methods
        `,
        [
          tenantId,
          payload.businessName,
          payload.description,
          payload.locationLabel,
          payload.fullAddress,
          JSON.stringify(payload.paymentMethods ?? []),
        ],
      );

      return rows[0] ? mapProfile(rows[0]) : null;
    },
  };
}

function mapProfile(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    businessName: row.business_name,
    description: row.description,
    locationLabel: row.location_label,
    fullAddress: row.full_address,
    paymentMethods: Array.isArray(row.payment_methods) ? row.payment_methods : [],
  };
}
