import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { loadConfig } from "../../src/app/config.js";
import { createDbPool } from "../../src/db/pool.js";

assertDatabaseUrlForTests();

const config = loadConfig();
const pool = createDbPool({ databaseUrl: config.databaseUrl });
const migration002Path = path.resolve(process.cwd(), "db/migrations/002_align_auth_foundation_schema.sql");
const migration002Sql = readFileSync(migration002Path, "utf8");
const migration003Path = path.resolve(process.cwd(), "db/migrations/003_enforce_global_owner_email.sql");
const migration003Sql = readFileSync(migration003Path, "utf8");

test.after(async () => {
  await pool.end();
});

test("002_align_auth_foundation_schema upgrades auth bootstrap tables safely", async () => {
  const client = await pool.connect();
  const schemaName = `migration_002_${randomUUID().replace(/-/g, "_")}`;

  try {
    await client.query("BEGIN");
    await client.query(`CREATE SCHEMA "${schemaName}"`);
    await client.query(`SET LOCAL search_path TO "${schemaName}", public`);

    await client.query(`
      CREATE TABLE tenants (
        id UUID PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        vertical TEXT NOT NULL,
        plan_code TEXT NOT NULL,
        subscription_status TEXT NOT NULL,
        business_whatsapp TEXT NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE users (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        email TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'owner',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (tenant_id, email)
      )
    `);

    const tenantId = randomUUID();
    const userId = randomUUID();

    await client.query(
      `
        INSERT INTO tenants (
          id, name, slug, vertical, plan_code, subscription_status, business_whatsapp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [tenantId, "Loja Teste", "loja-teste", "moda-feminina", "basic", "trial", "5511999999999"],
    );

    await client.query(
      `
        INSERT INTO users (
          id, tenant_id, email, password_hash, role
        ) VALUES ($1, $2, $3, $4, $5)
      `,
      [userId, tenantId, "owner@example.com", "hash", "owner"],
    );

    await client.query(migration002Sql);

    const { rows: ownerRows } = await client.query("SELECT owner_name FROM users WHERE id = $1", [userId]);
    assert.equal(ownerRows[0].owner_name, "Owner");

    const { rows: tenantColumnRows } = await client.query(`
      SELECT is_nullable
      FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = 'tenants'
        AND column_name = 'business_whatsapp'
    `, [schemaName]);

    const { rows: userColumnRows } = await client.query(`
      SELECT is_nullable
      FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = 'users'
        AND column_name = 'owner_name'
    `, [schemaName]);

    assert.equal(tenantColumnRows[0].is_nullable, "YES");
    assert.equal(userColumnRows[0].is_nullable, "NO");
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    client.release();
  }
});

test("003_enforce_global_owner_email fails fast when legacy duplicate emails exist", async () => {
  const client = await pool.connect();
  const schemaName = `migration_003_${randomUUID().replace(/-/g, "_")}`;

  try {
    await client.query("BEGIN");
    await client.query(`CREATE SCHEMA "${schemaName}"`);
    await client.query(`SET LOCAL search_path TO "${schemaName}", public`);

    await client.query(`
      CREATE TABLE tenants (
        id UUID PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        vertical TEXT NOT NULL,
        plan_code TEXT NOT NULL,
        subscription_status TEXT NOT NULL,
        business_whatsapp TEXT UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE users (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        owner_name TEXT NOT NULL,
        email TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'owner',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (tenant_id, email)
      )
    `);

    const tenantA = randomUUID();
    const tenantB = randomUUID();
    const duplicateEmail = "shared@example.com";

    await client.query(
      `
        INSERT INTO tenants (id, name, slug, vertical, plan_code, subscription_status, business_whatsapp)
        VALUES
          ($1, 'Tenant A', 'tenant-a', 'moda-feminina', 'basic', 'trial', '5511111111111'),
          ($2, 'Tenant B', 'tenant-b', 'salao', 'pro', 'trial', '5522222222222')
      `,
      [tenantA, tenantB],
    );

    await client.query(
      `
        INSERT INTO users (id, tenant_id, owner_name, email, password_hash, role)
        VALUES
          ($1, $3, 'Owner A', $5, 'hash-a', 'owner'),
          ($2, $4, 'Owner B', $5, 'hash-b', 'owner')
      `,
      [randomUUID(), randomUUID(), tenantA, tenantB, duplicateEmail],
    );

    await assert.rejects(
      () => client.query(migration003Sql),
      /Cannot enforce global owner email uniqueness because duplicate emails already exist across tenants\./,
    );
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    client.release();
  }
});

function assertDatabaseUrlForTests() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be explicitly set before running database migration tests.");
  }
}
