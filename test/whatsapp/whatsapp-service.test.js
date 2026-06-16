import test from "node:test";
import assert from "node:assert/strict";

import { createWhatsAppService } from "../../src/whatsapp/whatsapp-service.js";

function buildWebhookPayload(overrides = {}) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: overrides.entryId ?? "entry-1",
        changes: [
          {
            field: "messages",
            value: {
              metadata: {
                display_phone_number: overrides.displayPhoneNumber ?? "5511999991111",
                phone_number_id: overrides.phoneNumberId ?? "phone-number-id-1",
              },
              messages: [
                {
                  id: overrides.messageId ?? "wamid-1",
                  from: overrides.customerPhone ?? "5511988887777",
                  timestamp: overrides.timestamp ?? "1780000000",
                  type: "text",
                  text: {
                    body: overrides.body ?? "Quais formas de pagamento?",
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

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

function createRuntimeTenant() {
  return {
    id: "tenant-1",
    businessName: "Loja Exemplo",
    vertical: "moda-feminina",
    planCode: "pro",
    subscriptionStatus: "active",
    hours: [],
    location: "Rua A, 100",
    paymentMethods: ["pix"],
    faqItems: [{ question: "Aceita Pix?", answer: "Sim." }],
    catalogItems: [],
    services: [],
  };
}

function createBaseDependencies(overrides = {}) {
  const sentMessages = [];
  const persistedMessages = [];
  const persistedLeads = [];
  const persistedPreAppointments = [];
  let currentConversation = null;

  const service = createWhatsAppService({
    pool: createPoolStub(),
    tenantRepository: {
      async findByBusinessWhatsApp() {
        return { id: "tenant-1" };
      },
    },
    conversationRepository: {
      async findByTenantAndCustomerPhone() {
        return currentConversation;
      },
      async create(_client, conversation) {
        currentConversation = conversation;
        return conversation;
      },
      async touchLastMessageAt(_client, _tenantId, _conversationId, occurredAt) {
        currentConversation = {
          ...currentConversation,
          lastMessageAt: occurredAt,
        };
        return currentConversation;
      },
    },
    messageRepository: {
      async create(_client, message) {
        persistedMessages.push(message);
        return message;
      },
    },
    whatsappEventRepository: {
      async findByTenantAndProviderEventId() {
        return null;
      },
      async create() {},
      async markProcessed() {},
    },
    leadRepository: {
      async upsertByConversation(_client, payload) {
        persistedLeads.push(payload);
        return payload;
      },
    },
    preAppointmentRepository: {
      async upsertByConversation(_client, payload) {
        persistedPreAppointments.push(payload);
        return payload;
      },
    },
    whatsappOutboundClient: {
      async sendTextMessage(payload) {
        sentMessages.push(payload);
        return { accepted: true };
      },
    },
    runtimeContextLoader: async () => createRuntimeTenant(),
    logger: { info() {}, error() {} },
    verifyToken: "verify-token",
    ...overrides,
  });

  return {
    service,
    sentMessages,
    persistedMessages,
    persistedLeads,
    persistedPreAppointments,
  };
}

test("ingestWebhook uses model reply and persists outbound message for a resolved tenant", async () => {
  const { service, sentMessages, persistedMessages } = createBaseDependencies({
    model: async () => ({
      intent: "faq",
      reply: "Aceitamos Pix e cartao.",
      requestedAction: "faq_answer",
      entities: {},
      confidence: 0.95,
      fallbackReason: null,
    }),
  });

  const result = await service.ingestWebhook(buildWebhookPayload());

  assert.equal(result.accepted, true);
  assert.equal(result.messagePersisted, true);
  assert.equal(persistedMessages.length, 2);
  assert.equal(persistedMessages[1].direction, "outbound");
  assert.equal(persistedMessages[1].content, "Aceitamos Pix e cartao.");
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].text, "Aceitamos Pix e cartao.");
});

test("ingestWebhook falls back to handoff when the model throws invalid output", async () => {
  const { service, sentMessages } = createBaseDependencies({
    model: async () => {
      throw new Error("Gemini returned invalid JSON output.");
    },
  });

  const result = await service.ingestWebhook(buildWebhookPayload({ messageId: "wamid-2" }));

  assert.equal(result.accepted, true);
  assert.equal(result.messagePersisted, true);
  assert.equal(sentMessages.length, 1);
  assert.match(sentMessages[0].text, /atendente humano/i);
});

test("ingestWebhook persists lead capture and updates the same conversation record", async () => {
  const { service, persistedLeads } = createBaseDependencies({
    model: async ({ input }) => ({
      intent: "lead_interest",
      reply: "Vou registrar seu interesse.",
      requestedAction: "lead_capture",
      entities: {
        customerName: "Maria",
        interestSummary: input.customerMessage,
      },
      confidence: 0.95,
      fallbackReason: null,
    }),
  });

  await service.ingestWebhook(buildWebhookPayload({ body: "Quero saber sobre vestido midi" }));
  await service.ingestWebhook(buildWebhookPayload({ messageId: "wamid-3", body: "Quero saber sobre vestido midi azul" }));

  assert.equal(persistedLeads.length, 2);
  assert.equal(persistedLeads[0].conversationId, persistedLeads[1].conversationId);
  assert.equal(persistedLeads[0].customerPhone, "5511988887777");
  assert.equal(persistedLeads[1].interestSummary, "Quero saber sobre vestido midi azul");
});

test("ingestWebhook persists pre-appointment capture and updates the same conversation record", async () => {
  const { service, persistedPreAppointments } = createBaseDependencies({
    runtimeContextLoader: async () => ({
      ...createRuntimeTenant(),
      planCode: "premium",
      services: [{ name: "Corte feminino" }],
    }),
    model: async ({ input }) => ({
      intent: "schedule_request",
      reply: "Posso registrar seu pre-agendamento.",
      requestedAction: "pre_appointment",
      entities: {
        customerName: "Ana",
        requestedService: "Corte feminino",
        preferredDate: input.customerMessage.includes("amanha") ? "2026-06-17" : "2026-06-18",
        preferredTimeWindow: "manha",
        notes: input.customerMessage,
      },
      confidence: 0.96,
      fallbackReason: null,
    }),
  });

  await service.ingestWebhook(buildWebhookPayload({ body: "Quero marcar amanha de manha" }));
  await service.ingestWebhook(buildWebhookPayload({ messageId: "wamid-4", body: "Melhor depois, no dia 18" }));

  assert.equal(persistedPreAppointments.length, 2);
  assert.equal(persistedPreAppointments[0].conversationId, persistedPreAppointments[1].conversationId);
  assert.equal(persistedPreAppointments[0].customerPhone, "5511988887777");
  assert.equal(persistedPreAppointments[1].preferredDate, "2026-06-18");
});

test("ingestWebhook falls back to handoff when commercial persistence fails", async () => {
  const { service, sentMessages } = createBaseDependencies({
    model: async () => ({
      intent: "lead_interest",
      reply: "Vou registrar seu interesse.",
      requestedAction: "lead_capture",
      entities: {
        customerName: "Maria",
        interestSummary: "Interesse em vestido",
      },
      confidence: 0.95,
      fallbackReason: null,
    }),
    leadRepository: {
      async upsertByConversation() {
        throw new Error("Lead repository failure");
      },
    },
  });

  await service.ingestWebhook(buildWebhookPayload({ messageId: "wamid-5" }));

  assert.equal(sentMessages.length, 1);
  assert.match(sentMessages[0].text, /atendente humano/i);
});

test("ingestWebhook blocks paid automation when monthly conversation quota is exhausted", async () => {
  const { service, sentMessages } = createBaseDependencies({
    runtimeContextLoader: async () => ({
      ...createRuntimeTenant(),
      planCode: "pro",
    }),
    usageLoader: async () => ({
      monthlyConversations: 250,
    }),
    model: async () => ({
      intent: "faq",
      reply: "Nao deveria responder.",
      requestedAction: "faq_answer",
      entities: {},
      confidence: 0.99,
      fallbackReason: null,
    }),
  });

  await service.ingestWebhook(buildWebhookPayload({ messageId: "wamid-quota" }));

  assert.equal(sentMessages.length, 1);
  assert.match(sentMessages[0].text, /indisponivel/i);
});

test("ingestWebhook accepts inbound processing even when outbound transport fails", async () => {
  const { service } = createBaseDependencies({
    model: async () => ({
      intent: "faq",
      reply: "Aceitamos Pix e cartao.",
      requestedAction: "faq_answer",
      entities: {},
      confidence: 0.95,
      fallbackReason: null,
    }),
    whatsappOutboundClient: {
      async sendTextMessage() {
        throw new Error("Meta delivery failed");
      },
    },
  });

  const result = await service.ingestWebhook(buildWebhookPayload({ messageId: "wamid-outbound-fail" }));

  assert.equal(result.accepted, true);
  assert.equal(result.tenantResolved, true);
  assert.equal(result.messagePersisted, true);
});
