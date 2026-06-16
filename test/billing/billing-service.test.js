import test from "node:test";
import assert from "node:assert/strict";

import { createBillingService } from "../../src/billing/billing-service.js";

function createPoolStub() {
  return {
    async connect() {
      return {
        async query() {},
        release() {},
      };
    },
  };
}

test("syncAsaasWebhook rejects PAYMENT_CREATED without an explicit billable status", async () => {
  const service = createBillingService({
    pool: createPoolStub(),
    tenantRepository: {
      async findById() {
        return { id: "tenant-1", planCode: "basic", subscriptionStatus: "trial" };
      },
      async findBySlug() {
        return null;
      },
    },
    subscriptionRepository: {
      async findByProviderExternalId() {
        return null;
      },
      async upsertByProviderExternalId() {
        throw new Error("Should not upsert unsupported statuses");
      },
    },
  });

  await assert.rejects(
    () =>
      service.syncAsaasWebhook({
        event: "PAYMENT_CREATED",
        payment: {
          subscription: "sub-1",
          externalReference: "tenant-1",
        },
      }),
    /supported status/i,
  );
});

test("syncAsaasWebhook rejects when an external subscription is already bound to another tenant", async () => {
  const service = createBillingService({
    pool: createPoolStub(),
    tenantRepository: {
      async findById(id) {
        return { id, planCode: "basic", subscriptionStatus: "trial" };
      },
      async findBySlug() {
        return null;
      },
    },
    subscriptionRepository: {
      async findByProviderExternalId() {
        return {
          tenantId: "tenant-a",
          externalSubscriptionId: "sub-1",
          provider: "asaas",
        };
      },
      async upsertByProviderExternalId() {
        throw new Error("Should not upsert on tenant mismatch");
      },
    },
  });

  await assert.rejects(
    () =>
      service.syncAsaasWebhook({
        event: "PAYMENT_RECEIVED",
        payment: {
          subscription: "sub-1",
          externalReference: "tenant-b",
        },
      }),
    /already bound to another tenant/i,
  );
});
