import test from "node:test";
import assert from "node:assert/strict";

import { createServer } from "../../src/app/server.js";
import { loadConfig } from "../../src/app/config.js";
import { runMigrations } from "../../src/db/migrator.js";
import { createDbPool } from "../../src/db/pool.js";

assertDatabaseUrlForTests();

const config = loadConfig();
const pool = createDbPool({ databaseUrl: config.databaseUrl });

async function resetDatabase() {
  await pool.query(`
    TRUNCATE TABLE
      audit_logs,
      usage_counters,
      pre_appointments,
      leads,
      messages,
      conversations,
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

async function startTestServer() {
  const server = createServer();

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
