import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { loadConfig } from "../../src/app/config.js";
import { createDbPool } from "../../src/db/pool.js";
import { createLeadRepository } from "../../src/db/repositories/lead-repository.js";
import { createPreAppointmentRepository } from "../../src/db/repositories/pre-appointment-repository.js";

assertDatabaseUrlForTests();

const config = loadConfig();
const pool = createDbPool({ databaseUrl: config.databaseUrl });
const migration001Sql = readFileSync(path.resolve(process.cwd(), "db/migrations/001_initial_schema.sql"), "utf8");
const migration004Sql = readFileSync(
  path.resolve(process.cwd(), "db/migrations/004_enforce_conversation_tenant_integrity.sql"),
  "utf8",
);
const migration005Sql = readFileSync(path.resolve(process.cwd(), "db/migrations/005_add_whatsapp_events.sql"), "utf8");
const migration006Sql = readFileSync(
  path.resolve(process.cwd(), "db/migrations/006_enforce_commercial_conversation_uniqueness.sql"),
  "utf8",
);

test.after(async () => {
  await pool.end();
});

test("leadRepository upsertByConversation inserts and updates a tenant-scoped lead", async () => {
  const client = await pool.connect();
  const schemaName = `commercial_lead_${randomUUID().replace(/-/g, "_")}`;

  try {
    await client.query("BEGIN");
    await client.query(`CREATE SCHEMA "${schemaName}"`);
    await client.query(`SET LOCAL search_path TO "${schemaName}", public`);
    await client.query(migration001Sql);
    await client.query(migration004Sql);
    await client.query(migration005Sql);
    await client.query(migration006Sql);

    const scopedPool = { query: (...args) => client.query(...args) };
    const leadRepository = createLeadRepository({ pool: scopedPool });
    const tenantId = await seedTenant(client, "tenant-lead");
    const conversationId = await seedConversation(client, tenantId, "5511991112222");

    const first = await leadRepository.upsertByConversation(null, {
      id: randomUUID(),
      tenantId,
      conversationId,
      customerName: "Maria",
      customerPhone: "5511991112222",
      interestSummary: "Interesse em vestido midi",
      status: "new",
    });

    const second = await leadRepository.upsertByConversation(null, {
      id: randomUUID(),
      tenantId,
      conversationId,
      customerName: "Maria Clara",
      customerPhone: "5511991112222",
      interestSummary: "Interesse em vestido midi azul",
      status: "contacted",
    });

    assert.equal(first.customerName, "Maria");
    assert.equal(second.customerName, "Maria Clara");
    assert.equal(second.interestSummary, "Interesse em vestido midi azul");
    assert.equal(second.status, "contacted");

    const { rows } = await client.query(
      "SELECT COUNT(*)::int AS count FROM leads WHERE tenant_id = $1 AND conversation_id = $2",
      [tenantId, conversationId],
    );

    assert.equal(rows[0].count, 1);
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    client.release();
  }
});

test("preAppointmentRepository upsertByConversation inserts and updates a tenant-scoped pre-appointment", async () => {
  const client = await pool.connect();
  const schemaName = `commercial_pre_${randomUUID().replace(/-/g, "_")}`;

  try {
    await client.query("BEGIN");
    await client.query(`CREATE SCHEMA "${schemaName}"`);
    await client.query(`SET LOCAL search_path TO "${schemaName}", public`);
    await client.query(migration001Sql);
    await client.query(migration004Sql);
    await client.query(migration005Sql);
    await client.query(migration006Sql);

    const scopedPool = { query: (...args) => client.query(...args) };
    const preAppointmentRepository = createPreAppointmentRepository({ pool: scopedPool });
    const tenantId = await seedTenant(client, "tenant-pre");
    const conversationId = await seedConversation(client, tenantId, "5511993334444");

    const first = await preAppointmentRepository.upsertByConversation(null, {
      id: randomUUID(),
      tenantId,
      conversationId,
      customerName: "Ana",
      customerPhone: "5511993334444",
      requestedService: "Corte feminino",
      preferredDate: "2026-06-20",
      preferredTimeWindow: "manha",
      notes: "Primeira visita",
      status: "pending_confirmation",
    });

    const second = await preAppointmentRepository.upsertByConversation(null, {
      id: randomUUID(),
      tenantId,
      conversationId,
      customerName: "Ana Paula",
      customerPhone: "5511993334444",
      requestedService: "Corte feminino com escova",
      preferredDate: "2026-06-21",
      preferredTimeWindow: "tarde",
      notes: "Atualizou preferencia",
      status: "pending_confirmation",
    });

    assert.equal(first.customerName, "Ana");
    assert.equal(second.customerName, "Ana Paula");
    assert.equal(second.requestedService, "Corte feminino com escova");
    assert.equal(second.preferredDate, "2026-06-21");
    assert.equal(second.preferredTimeWindow, "tarde");

    const { rows } = await client.query(
      "SELECT COUNT(*)::int AS count FROM pre_appointments WHERE tenant_id = $1 AND conversation_id = $2",
      [tenantId, conversationId],
    );

    assert.equal(rows[0].count, 1);
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    client.release();
  }
});

async function seedTenant(client, slug) {
  const tenantId = randomUUID();

  await client.query(
    `
      INSERT INTO tenants (id, name, slug, vertical, plan_code, subscription_status, business_whatsapp)
      VALUES ($1, 'Tenant Teste', $2, 'premium', 'premium', 'active', $3)
    `,
    [tenantId, slug, `55${Math.floor(Math.random() * 10_000_000_000)}`],
  );

  return tenantId;
}

async function seedConversation(client, tenantId, customerPhone) {
  const conversationId = randomUUID();

  await client.query(
    `
      INSERT INTO conversations (id, tenant_id, customer_phone, status, started_at, last_message_at)
      VALUES ($1, $2, $3, 'open', NOW(), NOW())
    `,
    [conversationId, tenantId, customerPhone],
  );

  return conversationId;
}

function assertDatabaseUrlForTests() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be explicitly set before running database repository tests.");
  }
}
