export function createSubscriptionRepository({ pool }) {
  return {
    async findByProviderExternalId(provider, externalSubscriptionId) {
      const { rows } = await pool.query(
        `
          SELECT
            id,
            tenant_id,
            provider,
            external_subscription_id,
            plan_code,
            status,
            trial_ends_at,
            current_period_ends_at,
            created_at,
            updated_at
          FROM subscriptions
          WHERE provider = $1
            AND external_subscription_id = $2
          LIMIT 1
        `,
        [provider, externalSubscriptionId],
      );

      return rows[0] ? mapSubscription(rows[0]) : null;
    },

    async findLatestByTenantId(tenantId) {
      const { rows } = await pool.query(
        `
          SELECT
            id,
            tenant_id,
            provider,
            external_subscription_id,
            plan_code,
            status,
            trial_ends_at,
            current_period_ends_at,
            created_at,
            updated_at
          FROM subscriptions
          WHERE tenant_id = $1
          ORDER BY updated_at DESC, created_at DESC
          LIMIT 1
        `,
        [tenantId],
      );

      return rows[0] ? mapSubscription(rows[0]) : null;
    },

    async upsertByProviderExternalId(client, subscription) {
      const executor = client ?? pool;
      const { rows } = await executor.query(
        `
          INSERT INTO subscriptions (
            id,
            tenant_id,
            provider,
            external_subscription_id,
            plan_code,
            status,
            trial_ends_at,
            current_period_ends_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (provider, external_subscription_id)
          DO UPDATE SET
            tenant_id = EXCLUDED.tenant_id,
            plan_code = EXCLUDED.plan_code,
            status = EXCLUDED.status,
            trial_ends_at = EXCLUDED.trial_ends_at,
            current_period_ends_at = EXCLUDED.current_period_ends_at,
            updated_at = NOW()
          RETURNING
            id,
            tenant_id,
            provider,
            external_subscription_id,
            plan_code,
            status,
            trial_ends_at,
            current_period_ends_at,
            created_at,
            updated_at
        `,
        [
          subscription.id,
          subscription.tenantId,
          subscription.provider,
          subscription.externalSubscriptionId,
          subscription.planCode,
          subscription.status,
          subscription.trialEndsAt,
          subscription.currentPeriodEndsAt,
        ],
      );

      return mapSubscription(rows[0]);
    },
  };
}

function mapSubscription(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    provider: row.provider,
    externalSubscriptionId: row.external_subscription_id,
    planCode: row.plan_code,
    status: row.status,
    trialEndsAt: serializeDate(row.trial_ends_at),
    currentPeriodEndsAt: serializeDate(row.current_period_ends_at),
    createdAt: serializeDate(row.created_at),
    updatedAt: serializeDate(row.updated_at),
  };
}

function serializeDate(value) {
  return value?.toISOString?.() ?? value ?? null;
}
