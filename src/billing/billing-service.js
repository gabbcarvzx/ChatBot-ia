import { randomUUID } from "node:crypto";

const DIRECT_STATUS_MAP = new Map([
  ["TRIAL", "trial"],
  ["ACTIVE", "active"],
  ["OVERDUE", "overdue"],
  ["BLOCKED", "blocked"],
]);

const EVENT_STATUS_RULES = [
  { pattern: /OVERDUE|LATE_PAYMENT/i, status: "overdue" },
  { pattern: /CANCEL|DELETE|REMOVE|INACTIV/i, status: "blocked" },
  { pattern: /TRIAL/i, status: "trial" },
  { pattern: /RECEIVED|CONFIRMED|CREATED|RESTORED|ACTIV/i, status: "active" },
];

export function createBillingService({ pool, tenantRepository, subscriptionRepository }) {
  async function getSubscription(tenant) {
    const subscription = await subscriptionRepository.findLatestByTenantId(tenant.id);

    if (!subscription) {
      return {
        tenantId: tenant.id,
        provider: null,
        externalSubscriptionId: null,
        planCode: tenant.planCode,
        status: tenant.subscriptionStatus,
        trialEndsAt: null,
        currentPeriodEndsAt: null,
      };
    }

    return structuredClone(subscription);
  }

  async function syncAsaasWebhook(payload) {
    const normalized = normalizeAsaasPayload(payload);

    if (!normalized.externalReference) {
      throw createHttpError(400, "Asaas webhook payload is missing externalReference.");
    }

    if (!normalized.externalSubscriptionId) {
      throw createHttpError(400, "Asaas webhook payload is missing the subscription id.");
    }

    if (!normalized.status) {
      throw createHttpError(400, "Asaas webhook payload does not map to a supported status.");
    }

    const tenant =
      (await tenantRepository.findById(normalized.externalReference)) ??
      (await tenantRepository.findBySlug(normalized.externalReference));

    if (!tenant) {
      throw createHttpError(404, "Tenant referenced by the Asaas webhook was not found.");
    }

    const effectivePlanCode = normalized.planCode ?? tenant.planCode;
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const subscription = await subscriptionRepository.upsertByProviderExternalId(client, {
        id: randomUUID(),
        tenantId: tenant.id,
        provider: "asaas",
        externalSubscriptionId: normalized.externalSubscriptionId,
        planCode: effectivePlanCode,
        status: normalized.status,
        trialEndsAt: normalized.trialEndsAt,
        currentPeriodEndsAt: normalized.currentPeriodEndsAt,
      });

      const updatedTenant = await tenantRepository.updateBillingState(client, tenant.id, {
        planCode: effectivePlanCode,
        subscriptionStatus: normalized.status,
      });

      await client.query("COMMIT");

      return {
        accepted: true,
        tenantId: updatedTenant.id,
        planCode: updatedTenant.planCode,
        status: updatedTenant.subscriptionStatus,
        provider: subscription.provider,
        externalSubscriptionId: subscription.externalSubscriptionId,
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  return {
    getSubscription,
    syncAsaasWebhook,
  };
}

function normalizeAsaasPayload(payload = {}) {
  const payment = payload.payment ?? {};
  const subscription = payload.subscription ?? {};

  const event = String(payload.event ?? "");
  const externalReference = stringifyReference(
    payment.externalReference ?? subscription.externalReference ?? payload.externalReference,
  );
  const externalSubscriptionId = stringifyReference(
    payment.subscription ??
      subscription.id ??
      payload.subscriptionId ??
      payload.id,
  );
  const planCode = normalizePlanCode(
    subscription.planCode ?? payment.planCode ?? payload.planCode,
  );
  const status = normalizeStatus(subscription.status ?? payment.status ?? payload.status, event);

  return {
    event,
    externalReference,
    externalSubscriptionId,
    planCode,
    status,
    trialEndsAt: normalizeTimestamp(
      subscription.trialEnd ?? payload.trialEnd ?? payload.trialEndsAt,
    ),
    currentPeriodEndsAt: normalizeTimestamp(
      subscription.currentPeriodEnd ??
        payload.currentPeriodEnd ??
        payload.currentPeriodEndsAt,
    ),
  };
}

function normalizeStatus(rawStatus, event) {
  const normalizedRaw = String(rawStatus ?? "").trim().toUpperCase();

  if (DIRECT_STATUS_MAP.has(normalizedRaw)) {
    return DIRECT_STATUS_MAP.get(normalizedRaw);
  }

  for (const rule of EVENT_STATUS_RULES) {
    if (rule.pattern.test(event)) {
      return rule.status;
    }
  }

  return null;
}

function normalizePlanCode(value) {
  const planCode = String(value ?? "").trim().toLowerCase();
  return planCode || null;
}

function normalizeTimestamp(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function stringifyReference(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
