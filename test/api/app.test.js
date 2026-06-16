import test from "node:test";
import assert from "node:assert/strict";

import { createServer } from "../../src/app/server.js";
import { loadConfig } from "../../src/app/config.js";
import { runMigrations } from "../../src/db/migrator.js";
import { createDbPool } from "../../src/db/pool.js";

assertDatabaseUrlForTests();
process.env.WHATSAPP_CLOUD_API_VERIFY_TOKEN = "test-whatsapp-verify-token";
process.env.WHATSAPP_CLOUD_API_TOKEN = "test-whatsapp-access-token";
process.env.WHATSAPP_CLOUD_API_PHONE_NUMBER_ID = "test-whatsapp-phone-number-id";
process.env.ASAAS_WEBHOOK_SECRET = "test-asaas-secret";

const config = loadConfig();
const pool = createDbPool({ databaseUrl: config.databaseUrl });

function createDefaultTestLlmModel() {
  return async () => ({
    intent: "faq",
    reply: "Resposta automatica de teste.",
    requestedAction: "faq_answer",
    entities: {},
    confidence: 0.95,
    fallbackReason: null,
  });
}

function createDefaultTestWhatsAppOutboundClient() {
  return {
    async sendTextMessage() {
      return { accepted: true, provider: "whatsapp_test_mock" };
    },
  };
}

async function resetDatabase() {
  await pool.query(`
    TRUNCATE TABLE
      audit_logs,
      usage_counters,
      pre_appointments,
      leads,
      messages,
      conversations,
      whatsapp_events,
      subscriptions,
      faq_items,
      catalog_items,
      business_hours,
      business_profiles,
      users,
      tenants
    RESTART IDENTITY CASCADE
  `);
}

async function startTestServer(overrides = {}) {
  const server = createServer({
    llmModel: createDefaultTestLlmModel(),
    whatsappOutboundClient: createDefaultTestWhatsAppOutboundClient(),
    ...overrides,
  });

  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

async function createAuthenticatedTenant(app, overrides = {}) {
  const response = await fetch(`${app.baseUrl}/v1/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ownerName: "Tenant Owner",
      email: "owner@example.com",
      password: "StrongPass123!",
      companyName: "Tenant Base",
      companySlug: "tenant-base",
      vertical: "moda-feminina",
      planCode: "basic",
      ...overrides,
    }),
  });

  const body = await response.json();

  return {
    token: body.accessToken,
    tenantId: body.tenant.id,
    body,
  };
}

async function updateTenantWhatsApp(app, { tenantId, token, businessWhatsApp }) {
  const response = await fetch(`${app.baseUrl}/v1/business-profile`, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-tenant-id": tenantId,
    },
    body: JSON.stringify({
      businessName: "Tenant Base",
      locationLabel: "Centro",
      fullAddress: "Rua A, 100",
      paymentMethods: ["pix"],
      businessWhatsApp,
    }),
  });

  assert.equal(response.status, 200);
}

function buildWhatsAppTextWebhookPayload(overrides = {}) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: overrides.entryId ?? "entry_1",
        changes: [
          {
            field: "messages",
            value: {
              metadata: {
                display_phone_number: overrides.displayPhoneNumber ?? "5511999991111",
                phone_number_id: overrides.phoneNumberId ?? "phone_number_id_1",
              },
              contacts: [
                {
                  wa_id: overrides.customerPhone ?? "5511988887777",
                  profile: { name: overrides.customerName ?? "Maria" },
                },
              ],
              messages: [
                {
                  id: overrides.messageId ?? "wamid-123",
                  from: overrides.customerPhone ?? "5511988887777",
                  timestamp: overrides.timestamp ?? "1780000000",
                  type: "text",
                  text: { body: overrides.body ?? "Qual o horario de atendimento?" },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

async function readLeadByConversation(tenantId, customerPhone) {
  const { rows } = await pool.query(
    `
      SELECT l.customer_name, l.customer_phone, l.interest_summary, l.status
      FROM leads l
      JOIN conversations c
        ON c.tenant_id = l.tenant_id
       AND c.id = l.conversation_id
      WHERE l.tenant_id = $1
        AND c.customer_phone = $2
      LIMIT 1
    `,
    [tenantId, customerPhone],
  );

  return rows[0] ?? null;
}

async function readPreAppointmentByConversation(tenantId, customerPhone) {
  const { rows } = await pool.query(
    `
      SELECT p.customer_name, p.customer_phone, p.requested_service, p.preferred_date, p.preferred_time_window, p.notes, p.status
      FROM pre_appointments p
      JOIN conversations c
        ON c.tenant_id = p.tenant_id
       AND c.id = p.conversation_id
      WHERE p.tenant_id = $1
        AND c.customer_phone = $2
      LIMIT 1
    `,
    [tenantId, customerPhone],
  );

  if (!rows[0]) {
    return null;
  }

  return {
    ...rows[0],
    preferred_date: rows[0].preferred_date?.toISOString?.().slice(0, 10) ?? rows[0].preferred_date,
  };
}

test.before(async () => {
  await runMigrations({ pool });
});

test.beforeEach(async () => {
  await resetDatabase();
});

test.after(async () => {
  await pool.end();
});

function assertDatabaseUrlForTests() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be explicitly set before running API tests.");
  }
}

test("GET /health returns service status", async () => {
  const app = await startTestServer();

  try {
    const response = await fetch(`${app.baseUrl}/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.status, "ok");
    assert.equal(body.service, "atendeai-api");
  } finally {
    await app.close();
  }
});

test("GET /v1/webhooks/whatsapp returns challenge when verification token is valid", async () => {
  const app = await startTestServer();

  try {
    const response = await fetch(
      `${app.baseUrl}/v1/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=test-whatsapp-verify-token&hub.challenge=challenge-123`,
    );

    const body = await response.text();

    assert.equal(response.status, 200);
    assert.equal(body, "challenge-123");
  } finally {
    await app.close();
  }
});

test("GET /v1/webhooks/whatsapp rejects invalid verification token", async () => {
  const app = await startTestServer();

  try {
    const response = await fetch(
      `${app.baseUrl}/v1/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong-token&hub.challenge=challenge-123`,
    );

    const body = await response.json();

    assert.equal(response.status, 403);
    assert.match(body.error, /verify token/i);
  } finally {
    await app.close();
  }
});

test("POST /v1/webhooks/whatsapp persists a tenant-scoped conversation and message", async () => {
  const outboundMessages = [];
  const app = await startTestServer({
    whatsappOutboundClient: {
      async sendTextMessage(payload) {
        outboundMessages.push(payload);
        return { accepted: true, provider: "whatsapp_stub" };
      },
    },
  });

  try {
    const { tenantId, token } = await createAuthenticatedTenant(app, {
      email: "whatsapp-ingest@example.com",
      companySlug: "tenant-whatsapp-ingest",
    });

    await updateTenantWhatsApp(app, {
      tenantId,
      token,
      businessWhatsApp: "5511999991111",
    });

    const response = await fetch(`${app.baseUrl}/v1/webhooks/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildWhatsAppTextWebhookPayload()),
    });

    const body = await response.json();

    assert.equal(response.status, 202);
    assert.equal(body.accepted, true);
    assert.equal(body.tenantResolved, true);
    assert.equal(body.messagePersisted, true);
    assert.equal(outboundMessages.length, 1);
    assert.equal(outboundMessages[0].text, "Resposta automatica de teste.");
  } finally {
    await app.close();
  }
});

test("POST /v1/webhooks/whatsapp safely falls back to human handoff when llm output is invalid", async () => {
  const outboundMessages = [];
  const app = await startTestServer({
    llmModel: async () => {
      throw new Error("Gemini returned invalid JSON output.");
    },
    whatsappOutboundClient: {
      async sendTextMessage(payload) {
        outboundMessages.push(payload);
        return { accepted: true, provider: "whatsapp_stub" };
      },
    },
  });

  try {
    const { tenantId, token } = await createAuthenticatedTenant(app, {
      email: "whatsapp-handoff@example.com",
      companySlug: "tenant-whatsapp-handoff",
    });

    await updateTenantWhatsApp(app, {
      tenantId,
      token,
      businessWhatsApp: "5511999993333",
    });

    const response = await fetch(`${app.baseUrl}/v1/webhooks/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        buildWhatsAppTextWebhookPayload({
          displayPhoneNumber: "5511999993333",
          messageId: "wamid-handoff",
        }),
      ),
    });

    const body = await response.json();

    assert.equal(response.status, 202);
    assert.equal(body.accepted, true);
    assert.equal(body.tenantResolved, true);
    assert.equal(body.messagePersisted, true);
    assert.equal(outboundMessages.length, 1);
    assert.match(outboundMessages[0].text, /atendente humano/i);
  } finally {
    await app.close();
  }
});

test("POST /v1/webhooks/whatsapp persists and updates one lead per conversation", async () => {
  const app = await startTestServer({
    llmModel: async ({ input }) => ({
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

  try {
    const { tenantId, token } = await createAuthenticatedTenant(app, {
      email: "whatsapp-lead@example.com",
      companySlug: "tenant-whatsapp-lead",
      planCode: "pro",
    });

    await updateTenantWhatsApp(app, {
      tenantId,
      token,
      businessWhatsApp: "5511999994444",
    });

    await fetch(`${app.baseUrl}/v1/webhooks/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        buildWhatsAppTextWebhookPayload({
          displayPhoneNumber: "5511999994444",
          customerPhone: "5511977712345",
          messageId: "wamid-lead-1",
          body: "Interesse em vestido midi",
        }),
      ),
    });

    await fetch(`${app.baseUrl}/v1/webhooks/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        buildWhatsAppTextWebhookPayload({
          displayPhoneNumber: "5511999994444",
          customerPhone: "5511977712345",
          messageId: "wamid-lead-2",
          body: "Interesse em vestido midi azul",
        }),
      ),
    });

    const lead = await readLeadByConversation(tenantId, "5511977712345");
    const { rows } = await pool.query("SELECT COUNT(*)::int AS count FROM leads WHERE tenant_id = $1", [tenantId]);

    assert.ok(lead);
    assert.equal(lead.customer_name, "Maria");
    assert.equal(lead.customer_phone, "5511977712345");
    assert.equal(lead.interest_summary, "Interesse em vestido midi azul");
    assert.equal(rows[0].count, 1);
  } finally {
    await app.close();
  }
});

test("POST /v1/webhooks/whatsapp persists and updates one pre-appointment per conversation", async () => {
  const app = await startTestServer({
    llmModel: async ({ input }) => ({
      intent: "schedule_request",
      reply: "Vou registrar seu pre-agendamento.",
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

  try {
    const { tenantId, token } = await createAuthenticatedTenant(app, {
      email: "whatsapp-pre@example.com",
      companySlug: "tenant-whatsapp-pre",
      planCode: "premium",
    });

    await updateTenantWhatsApp(app, {
      tenantId,
      token,
      businessWhatsApp: "5511999995555",
    });

    await fetch(`${app.baseUrl}/v1/catalog-items`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-tenant-id": tenantId,
      },
      body: JSON.stringify({
        itemType: "service",
        name: "Corte feminino",
        description: "Corte com finalizacao",
        priceCents: 8000,
      }),
    });

    await fetch(`${app.baseUrl}/v1/webhooks/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        buildWhatsAppTextWebhookPayload({
          displayPhoneNumber: "5511999995555",
          customerPhone: "5511966612345",
          messageId: "wamid-pre-1",
          body: "Quero marcar amanha",
        }),
      ),
    });

    await fetch(`${app.baseUrl}/v1/webhooks/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        buildWhatsAppTextWebhookPayload({
          displayPhoneNumber: "5511999995555",
          customerPhone: "5511966612345",
          messageId: "wamid-pre-2",
          body: "Melhor no dia 18",
        }),
      ),
    });

    const preAppointment = await readPreAppointmentByConversation(tenantId, "5511966612345");
    const { rows } = await pool.query(
      "SELECT COUNT(*)::int AS count FROM pre_appointments WHERE tenant_id = $1",
      [tenantId],
    );

    assert.ok(preAppointment);
    assert.equal(preAppointment.customer_name, "Ana");
    assert.equal(preAppointment.customer_phone, "5511966612345");
    assert.equal(preAppointment.requested_service, "Corte feminino");
    assert.equal(String(preAppointment.preferred_date).slice(0, 10), "2026-06-18");
    assert.equal(preAppointment.notes, "Melhor no dia 18");
    assert.equal(rows[0].count, 1);
  } finally {
    await app.close();
  }
});

test("POST /v1/webhooks/whatsapp ignores duplicate provider events", async () => {
  const app = await startTestServer();

  try {
    const { tenantId, token } = await createAuthenticatedTenant(app, {
      email: "whatsapp-duplicate@example.com",
      companySlug: "tenant-whatsapp-duplicate",
    });

    await updateTenantWhatsApp(app, {
      tenantId,
      token,
      businessWhatsApp: "5511999992222",
    });

    const payload = buildWhatsAppTextWebhookPayload({
      displayPhoneNumber: "5511999992222",
      messageId: "wamid-duplicate",
    });

    const firstResponse = await fetch(`${app.baseUrl}/v1/webhooks/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    const secondResponse = await fetch(`${app.baseUrl}/v1/webhooks/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    assert.equal(firstResponse.status, 202);
    assert.equal(secondResponse.status, 202);

    const secondBody = await secondResponse.json();
    assert.equal(secondBody.duplicate, true);
  } finally {
    await app.close();
  }
});

test("POST /v1/webhooks/whatsapp accepts unknown tenant payloads without persisting business data", async () => {
  const app = await startTestServer();

  try {
    const response = await fetch(`${app.baseUrl}/v1/webhooks/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        buildWhatsAppTextWebhookPayload({
          displayPhoneNumber: "5511990000000",
          messageId: "wamid-unknown-tenant",
        }),
      ),
    });

    const body = await response.json();

    assert.equal(response.status, 202);
    assert.equal(body.accepted, true);
    assert.equal(body.tenantResolved, false);
  } finally {
    await app.close();
  }
});

test("POST /v1/webhooks/whatsapp returns 202 when outbound delivery fails after persistence", async () => {
  const app = await startTestServer({
    whatsappOutboundClient: {
      async sendTextMessage() {
        throw new Error("Meta delivery failed");
      },
    },
  });

  try {
    const { tenantId, token } = await createAuthenticatedTenant(app, {
      email: "whatsapp-outbound-failure@example.com",
      companySlug: "tenant-whatsapp-outbound-failure",
    });

    await updateTenantWhatsApp(app, {
      tenantId,
      token,
      businessWhatsApp: "5511999996666",
    });

    const response = await fetch(`${app.baseUrl}/v1/webhooks/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        buildWhatsAppTextWebhookPayload({
          displayPhoneNumber: "5511999996666",
          messageId: "wamid-outbound-failure",
        }),
      ),
    });

    const body = await response.json();

    assert.equal(response.status, 202);
    assert.equal(body.accepted, true);
    assert.equal(body.tenantResolved, true);
    assert.equal(body.messagePersisted, true);
  } finally {
    await app.close();
  }
});

test("POST /v1/auth/register creates owner, tenant and returns access token", async () => {
  const app = await startTestServer();

  try {
    const response = await fetch(`${app.baseUrl}/v1/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ownerName: "Gabriel",
        email: "gabriel@example.com",
        password: "StrongPass123!",
        companyName: "Atelier Rosa",
        companySlug: "atelier-rosa",
        vertical: "moda-feminina",
        planCode: "basic",
      }),
    });

    const body = await response.json();

    assert.equal(response.status, 201);
    assert.ok(body.accessToken);
    assert.equal(body.user.ownerName, "Gabriel");
    assert.equal(body.user.email, "gabriel@example.com");
    assert.equal(body.tenant.slug, "atelier-rosa");
    assert.equal(body.tenant.subscriptionStatus, "trial");
  } finally {
    await app.close();
  }
});

test("POST /v1/auth/register rejects duplicate email", async () => {
  const app = await startTestServer();

  try {
    const payload = {
      ownerName: "Iris",
      email: "iris@example.com",
      password: "StrongPass123!",
      companyName: "Loja Iris",
      companySlug: "loja-iris",
      vertical: "moda-feminina",
      planCode: "basic",
    };

    await fetch(`${app.baseUrl}/v1/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    const response = await fetch(`${app.baseUrl}/v1/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...payload,
        companySlug: "loja-iris-2",
      }),
    });

    const body = await response.json();

    assert.equal(response.status, 409);
    assert.match(body.error, /email/i);
  } finally {
    await app.close();
  }
});

test("POST /v1/auth/register rejects duplicate slug", async () => {
  const app = await startTestServer();

  try {
    await fetch(`${app.baseUrl}/v1/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ownerName: "Nina",
        email: "nina@example.com",
        password: "StrongPass123!",
        companyName: "Loja Nina",
        companySlug: "loja-nina",
        vertical: "perfumaria",
        planCode: "basic",
      }),
    });

    const response = await fetch(`${app.baseUrl}/v1/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ownerName: "Nina 2",
        email: "nina-2@example.com",
        password: "StrongPass123!",
        companyName: "Loja Nina 2",
        companySlug: "loja-nina",
        vertical: "perfumaria",
        planCode: "basic",
      }),
    });

    const body = await response.json();

    assert.equal(response.status, 409);
    assert.match(body.error, /slug/i);
  } finally {
    await app.close();
  }
});

test("POST /v1/auth/login authenticates owner and returns a tenant-bound token", async () => {
  const app = await startTestServer();

  try {
    await fetch(`${app.baseUrl}/v1/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ownerName: "Lia",
        email: "lia@example.com",
        password: "StrongPass123!",
        companyName: "Clinica Vida",
        companySlug: "clinica-vida",
        vertical: "clinica",
        planCode: "premium",
      }),
    });

    const response = await fetch(`${app.baseUrl}/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "lia@example.com",
        password: "StrongPass123!",
      }),
    });

    const body = await response.json();

    assert.equal(response.status, 200);
    assert.ok(body.accessToken);
    assert.equal(body.user.ownerName, "Lia");
    assert.equal(body.tenant.slug, "clinica-vida");
  } finally {
    await app.close();
  }
});

test("POST /v1/auth/login rejects invalid credentials", async () => {
  const app = await startTestServer();

  try {
    await fetch(`${app.baseUrl}/v1/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ownerName: "Caio",
        email: "caio@example.com",
        password: "StrongPass123!",
        companyName: "Casa Caio",
        companySlug: "casa-caio",
        vertical: "material-construcao",
        planCode: "pro",
      }),
    });

    const response = await fetch(`${app.baseUrl}/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "caio@example.com",
        password: "WrongPass123!",
      }),
    });

    const body = await response.json();

    assert.equal(response.status, 401);
    assert.match(body.error, /invalid credentials/i);
  } finally {
    await app.close();
  }
});

test("authenticated tenant can update and read its own business profile", async () => {
  const app = await startTestServer();

  try {
    const registerResponse = await fetch(`${app.baseUrl}/v1/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ownerName: "Paula",
        email: "paula@example.com",
        password: "StrongPass123!",
        companyName: "Salao Bella",
        companySlug: "salao-bella",
        vertical: "salao",
        planCode: "pro",
      }),
    });

    const registerBody = await registerResponse.json();
    const token = registerBody.accessToken;
    const tenantId = registerBody.tenant.id;

    const updateResponse = await fetch(`${app.baseUrl}/v1/business-profile`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-tenant-id": tenantId,
      },
      body: JSON.stringify({
        businessName: "Salao Bella",
        description: "Especialista em cortes e coloracao",
        locationLabel: "Centro",
        fullAddress: "Rua das Flores, 10",
        paymentMethods: ["pix", "cartao"],
      }),
    });

    assert.equal(updateResponse.status, 200);

    const readResponse = await fetch(`${app.baseUrl}/v1/business-profile`, {
      headers: {
        authorization: `Bearer ${token}`,
        "x-tenant-id": tenantId,
      },
    });

    const readBody = await readResponse.json();

    assert.equal(readResponse.status, 200);
    assert.equal(readBody.businessName, "Salao Bella");
    assert.equal(readBody.description, "Especialista em cortes e coloracao");
    assert.deepEqual(readBody.paymentMethods, ["pix", "cartao"]);
  } finally {
    await app.close();
  }
});

test("authenticated requests are rejected when x-tenant-id does not match token tenant", async () => {
  const app = await startTestServer();

  try {
    const firstRegister = await fetch(`${app.baseUrl}/v1/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ownerName: "Ana",
        email: "ana@example.com",
        password: "StrongPass123!",
        companyName: "Loja Ana",
        companySlug: "loja-ana",
        vertical: "moda-feminina",
        planCode: "basic",
      }),
    });

    const secondRegister = await fetch(`${app.baseUrl}/v1/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ownerName: "Bruno",
        email: "bruno@example.com",
        password: "StrongPass123!",
        companyName: "Loja Bruno",
        companySlug: "loja-bruno",
        vertical: "perfumaria",
        planCode: "basic",
      }),
    });

    const firstBody = await firstRegister.json();
    const secondBody = await secondRegister.json();

    const response = await fetch(`${app.baseUrl}/v1/business-profile`, {
      headers: {
        authorization: `Bearer ${firstBody.accessToken}`,
        "x-tenant-id": secondBody.tenant.id,
      },
    });

    const body = await response.json();

    assert.equal(response.status, 403);
    assert.match(body.error, /tenant/i);
  } finally {
    await app.close();
  }
});

test("tenant onboarding status starts incomplete and becomes ready after required context is provided", async () => {
  const app = await startTestServer();

  try {
    const { token, tenantId } = await createAuthenticatedTenant(app, {
      email: "onboarding@example.com",
      companySlug: "tenant-onboarding",
    });

    const incompleteResponse = await fetch(`${app.baseUrl}/v1/onboarding/status`, {
      headers: {
        authorization: `Bearer ${token}`,
        "x-tenant-id": tenantId,
      },
    });

    assert.equal(incompleteResponse.status, 200);
    const incompleteBody = await incompleteResponse.json();
    assert.equal(incompleteBody.status, "incomplete");

    await fetch(`${app.baseUrl}/v1/business-profile`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-tenant-id": tenantId,
      },
      body: JSON.stringify({
        businessName: "Tenant Base",
        locationLabel: "Centro",
        fullAddress: "Rua A, 100",
        paymentMethods: ["pix"],
      }),
    });

    await fetch(`${app.baseUrl}/v1/business-hours`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-tenant-id": tenantId,
      },
      body: JSON.stringify({
        hours: [
          { weekday: 1, opensAt: "09:00", closesAt: "18:00", isClosed: false },
        ],
      }),
    });

    await fetch(`${app.baseUrl}/v1/faq-items`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-tenant-id": tenantId,
      },
      body: JSON.stringify({
        question: "Quais formas de pagamento aceitam?",
        answer: "Aceitamos Pix.",
      }),
    });

    await fetch(`${app.baseUrl}/v1/catalog-items`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-tenant-id": tenantId,
      },
      body: JSON.stringify({
        itemType: "product",
        name: "Vestido Midi",
        description: "Vestido floral",
        priceCents: 14990,
      }),
    });

    const readyResponse = await fetch(`${app.baseUrl}/v1/onboarding/status`, {
      headers: {
        authorization: `Bearer ${token}`,
        "x-tenant-id": tenantId,
      },
    });

    assert.equal(readyResponse.status, 200);
    const readyBody = await readyResponse.json();
    assert.equal(readyBody.status, "ready_for_activation");
  } finally {
    await app.close();
  }
});

test("tenant can replace and read business hours", async () => {
  const app = await startTestServer();

  try {
    const { token, tenantId } = await createAuthenticatedTenant(app, {
      email: "hours@example.com",
      companySlug: "tenant-hours",
    });

    const updateResponse = await fetch(`${app.baseUrl}/v1/business-hours`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-tenant-id": tenantId,
      },
      body: JSON.stringify({
        hours: [
          { weekday: 1, opensAt: "09:00", closesAt: "18:00", isClosed: false },
          { weekday: 0, opensAt: null, closesAt: null, isClosed: true },
        ],
      }),
    });

    assert.equal(updateResponse.status, 200);

    const readResponse = await fetch(`${app.baseUrl}/v1/business-hours`, {
      headers: {
        authorization: `Bearer ${token}`,
        "x-tenant-id": tenantId,
      },
    });

    assert.equal(readResponse.status, 200);
    const body = await readResponse.json();
    assert.equal(body.hours.length, 2);
    assert.equal(body.hours[0].weekday, 0);
    assert.equal(body.hours[1].weekday, 1);
  } finally {
    await app.close();
  }
});

test("tenant can create and list faq items", async () => {
  const app = await startTestServer();

  try {
    const { token, tenantId } = await createAuthenticatedTenant(app, {
      email: "faq@example.com",
      companySlug: "tenant-faq",
    });

    const createResponse = await fetch(`${app.baseUrl}/v1/faq-items`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-tenant-id": tenantId,
      },
      body: JSON.stringify({
        question: "Tem entrega?",
        answer: "Sim, para a cidade toda.",
      }),
    });

    assert.equal(createResponse.status, 201);

    const listResponse = await fetch(`${app.baseUrl}/v1/faq-items`, {
      headers: {
        authorization: `Bearer ${token}`,
        "x-tenant-id": tenantId,
      },
    });

    assert.equal(listResponse.status, 200);
    const body = await listResponse.json();
    assert.equal(body.items.length, 1);
    assert.equal(body.items[0].question, "Tem entrega?");
  } finally {
    await app.close();
  }
});

test("tenant can create and list catalog items", async () => {
  const app = await startTestServer();

  try {
    const { token, tenantId } = await createAuthenticatedTenant(app, {
      email: "catalog@example.com",
      companySlug: "tenant-catalog",
    });

    const createResponse = await fetch(`${app.baseUrl}/v1/catalog-items`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-tenant-id": tenantId,
      },
      body: JSON.stringify({
        itemType: "service",
        name: "Corte Feminino",
        description: "Corte com finalizacao",
        priceCents: 8000,
      }),
    });

    assert.equal(createResponse.status, 201);

    const listResponse = await fetch(`${app.baseUrl}/v1/catalog-items`, {
      headers: {
        authorization: `Bearer ${token}`,
        "x-tenant-id": tenantId,
      },
    });

    assert.equal(listResponse.status, 200);
    const body = await listResponse.json();
    assert.equal(body.items.length, 1);
    assert.equal(body.items[0].itemType, "service");
    assert.equal(body.items[0].name, "Corte Feminino");
  } finally {
    await app.close();
  }
});

test("GET /v1/subscription returns the effective tenant billing state", async () => {
  const app = await startTestServer();

  try {
    const { token, tenantId } = await createAuthenticatedTenant(app, {
      email: "subscription@example.com",
      companySlug: "tenant-subscription",
      planCode: "pro",
    });

    const response = await fetch(`${app.baseUrl}/v1/subscription`, {
      headers: {
        authorization: `Bearer ${token}`,
        "x-tenant-id": tenantId,
      },
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.planCode, "pro");
    assert.equal(body.status, "trial");
    assert.equal(body.provider, null);
  } finally {
    await app.close();
  }
});

test("POST /v1/webhooks/asaas rejects requests with an invalid webhook secret", async () => {
  const app = await startTestServer();

  try {
    const { tenantId } = await createAuthenticatedTenant(app, {
      email: "billing-invalid@example.com",
      companySlug: "tenant-billing-invalid",
    });

    const response = await fetch(`${app.baseUrl}/v1/webhooks/asaas`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "asaas-access-token": "wrong-secret",
      },
      body: JSON.stringify({
        event: "PAYMENT_RECEIVED",
        payment: {
          subscription: "sub_invalid",
          externalReference: tenantId,
        },
      }),
    });

    const body = await response.json();
    assert.equal(response.status, 401);
    assert.match(body.error, /webhook/i);
  } finally {
    await app.close();
  }
});

test("POST /v1/webhooks/asaas syncs the tenant subscription and status", async () => {
  const app = await startTestServer();

  try {
    const { token, tenantId } = await createAuthenticatedTenant(app, {
      email: "billing-valid@example.com",
      companySlug: "tenant-billing-valid",
      planCode: "basic",
    });

    const webhookResponse = await fetch(`${app.baseUrl}/v1/webhooks/asaas`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "asaas-access-token": "test-asaas-secret",
      },
      body: JSON.stringify({
        event: "PAYMENT_RECEIVED",
        payment: {
          subscription: "sub_123",
          externalReference: tenantId,
        },
        subscription: {
          id: "sub_123",
          status: "ACTIVE",
          planCode: "premium",
          currentPeriodEnd: "2026-07-15T00:00:00.000Z",
        },
      }),
    });

    assert.equal(webhookResponse.status, 202);

    const subscriptionResponse = await fetch(`${app.baseUrl}/v1/subscription`, {
      headers: {
        authorization: `Bearer ${token}`,
        "x-tenant-id": tenantId,
      },
    });

    assert.equal(subscriptionResponse.status, 200);
    const body = await subscriptionResponse.json();
    assert.equal(body.planCode, "premium");
    assert.equal(body.status, "active");
    assert.equal(body.provider, "asaas");
    assert.equal(body.externalSubscriptionId, "sub_123");
  } finally {
    await app.close();
  }
});
