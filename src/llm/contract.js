export function buildModelInput({ tenant, conversation, customerMessage }) {
  return {
    tenantId: tenant.id,
    businessProfile: {
      name: tenant.businessName,
      vertical: tenant.vertical,
      hours: tenant.hours,
      location: tenant.location,
      paymentMethods: tenant.paymentMethods,
      faqItems: tenant.faqItems,
      catalogItems: tenant.catalogItems,
      services: tenant.services,
    },
    plan: tenant.planCode,
    capabilities: tenant.capabilities,
    conversation,
    customerMessage,
    outputSchema: {
      intent: "string",
      reply: "string",
      requestedAction: "faq_answer | lead_capture | pre_appointment | human_handoff",
      entities: "object",
      confidence: "number",
      fallbackReason: "string | null",
    },
  };
}

export function buildSystemPolicy() {
  return [
    "You are a tenant-scoped WhatsApp assistant for a SaaS platform.",
    "Answer only with the approved tenant data provided in context.",
    "Never invent prices, availability, hours, addresses, payment methods or policies.",
    "If the customer requests something outside the approved context, prefer human handoff.",
    "Only request actions allowed by the current tenant plan.",
    "Return structured output that the backend can validate before persisting anything.",
  ].join(" ");
}
