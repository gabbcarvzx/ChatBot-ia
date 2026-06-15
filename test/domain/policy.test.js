import test from "node:test";
import assert from "node:assert/strict";

import {
  canUseCapability,
  createUsageSnapshot,
  enforceConversationQuota,
  resolveTenantAccess,
  validateModelAction,
} from "../../src/domain/policy.js";

test("basic plan can answer faq but cannot capture leads", () => {
  assert.equal(canUseCapability("basic", "faq_answer"), true);
  assert.equal(canUseCapability("basic", "lead_capture"), false);
});

test("pro plan can capture leads but cannot create pre-appointments", () => {
  assert.equal(canUseCapability("pro", "lead_capture"), true);
  assert.equal(canUseCapability("pro", "pre_appointment"), false);
});

test("premium plan can create pre-appointments", () => {
  assert.equal(canUseCapability("premium", "pre_appointment"), true);
});

test("conversation quota blocks when the tenant reaches its monthly limit", () => {
  const quota = enforceConversationQuota({
    planCode: "basic",
    usage: { monthlyConversations: 100 },
  });

  assert.equal(quota.allowed, false);
  assert.match(quota.reason, /quota/i);
});

test("conversation quota remains open when the tenant is below limit", () => {
  const quota = enforceConversationQuota({
    planCode: "pro",
    usage: { monthlyConversations: 249 },
  });

  assert.equal(quota.allowed, true);
});

test("blocked tenants lose paid automation even if the plan would allow it", () => {
  const access = resolveTenantAccess({
    planCode: "premium",
    subscriptionStatus: "blocked",
    usage: { monthlyConversations: 1 },
  });

  assert.equal(access.allowed, false);
  assert.match(access.reason, /subscription/i);
});

test("usage snapshot exposes plan capabilities and remaining conversations", () => {
  const snapshot = createUsageSnapshot({
    planCode: "pro",
    usage: { monthlyConversations: 100 },
  });

  assert.deepEqual(snapshot.capabilities.sort(), ["faq_answer", "lead_capture"]);
  assert.equal(snapshot.remainingConversations, 150);
});

test("model output is rejected when it requests an action outside the current plan", () => {
  const result = validateModelAction({
    planCode: "basic",
    modelOutput: {
      intent: "schedule_request",
      requestedAction: "pre_appointment",
      reply: "Posso agendar seu horario.",
      confidence: 0.92,
    },
  });

  assert.equal(result.accepted, false);
  assert.match(result.reason, /plan/i);
});

test("model output is rejected when confidence is below the handoff threshold", () => {
  const result = validateModelAction({
    planCode: "premium",
    modelOutput: {
      intent: "product_question",
      requestedAction: "faq_answer",
      reply: "Talvez o produto esteja disponivel.",
      confidence: 0.48,
    },
  });

  assert.equal(result.accepted, false);
  assert.match(result.reason, /confidence/i);
});

test("model output is accepted when the action fits the plan and confidence is high", () => {
  const result = validateModelAction({
    planCode: "premium",
    modelOutput: {
      intent: "schedule_request",
      requestedAction: "pre_appointment",
      reply: "Posso registrar sua preferencia de horario.",
      confidence: 0.91,
    },
  });

  assert.equal(result.accepted, true);
});
