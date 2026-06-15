const PLAN_DEFINITIONS = {
  basic: {
    conversationLimit: 100,
    capabilities: ["faq_answer"],
  },
  pro: {
    conversationLimit: 250,
    capabilities: ["faq_answer", "lead_capture"],
  },
  premium: {
    conversationLimit: 600,
    capabilities: ["faq_answer", "lead_capture", "pre_appointment"],
  },
};

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["trial", "active"]);
const DEFAULT_CONFIDENCE_THRESHOLD = 0.7;

function getPlanDefinition(planCode) {
  const plan = PLAN_DEFINITIONS[planCode];

  if (!plan) {
    throw new Error(`Unknown plan code: ${planCode}`);
  }

  return plan;
}

export function canUseCapability(planCode, capability) {
  return getPlanDefinition(planCode).capabilities.includes(capability);
}

export function enforceConversationQuota({ planCode, usage }) {
  const plan = getPlanDefinition(planCode);
  const used = usage?.monthlyConversations ?? 0;

  if (used >= plan.conversationLimit) {
    return {
      allowed: false,
      reason: "Monthly conversation quota exceeded for this tenant.",
      used,
      limit: plan.conversationLimit,
    };
  }

  return {
    allowed: true,
    used,
    limit: plan.conversationLimit,
  };
}

export function resolveTenantAccess({ planCode, subscriptionStatus, usage }) {
  if (!ACTIVE_SUBSCRIPTION_STATUSES.has(subscriptionStatus)) {
    return {
      allowed: false,
      reason: "Subscription status does not allow paid automation.",
    };
  }

  return enforceConversationQuota({ planCode, usage });
}

export function createUsageSnapshot({ planCode, usage }) {
  const plan = getPlanDefinition(planCode);
  const used = usage?.monthlyConversations ?? 0;

  return {
    planCode,
    capabilities: [...plan.capabilities],
    usedConversations: used,
    remainingConversations: Math.max(plan.conversationLimit - used, 0),
    conversationLimit: plan.conversationLimit,
  };
}

export function validateModelAction({
  planCode,
  modelOutput,
  confidenceThreshold = DEFAULT_CONFIDENCE_THRESHOLD,
}) {
  if (!modelOutput?.reply || !modelOutput?.requestedAction || !modelOutput?.intent) {
    return {
      accepted: false,
      reason: "Model output is missing required fields.",
    };
  }

  if ((modelOutput.confidence ?? 0) < confidenceThreshold) {
    return {
      accepted: false,
      reason: "Model confidence is below the handoff threshold.",
    };
  }

  const capabilityMap = {
    faq_answer: "faq_answer",
    lead_capture: "lead_capture",
    pre_appointment: "pre_appointment",
    human_handoff: "faq_answer",
  };

  const requiredCapability = capabilityMap[modelOutput.requestedAction];

  if (!requiredCapability) {
    return {
      accepted: false,
      reason: "Requested action is unknown.",
    };
  }

  if (!canUseCapability(planCode, requiredCapability)) {
    return {
      accepted: false,
      reason: "Requested action is not allowed by the current plan.",
    };
  }

  return {
    accepted: true,
    action: modelOutput.requestedAction,
  };
}

export function getPlanDefinitions() {
  return structuredClone(PLAN_DEFINITIONS);
}
