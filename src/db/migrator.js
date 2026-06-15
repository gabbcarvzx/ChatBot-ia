import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadConfig } from "../app/config.js";
import { assertDatabaseUrl } from "./config.js";
import { createDbPool } from "./pool.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../../db/migrations");

async function ensureMigrationTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getMigrationFiles() {
  const entries = await readdir(migrationsDir, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort();
}

export async function runMigrations({ pool }) {
  const client = await pool.connect();

  try {
    await ensureMigrationTable(client);

    const { rows } = await client.query("SELECT id FROM schema_migrations");
    const applied = new Set(rows.map((row) => row.id));
    const migrationFiles = await getMigrationFiles();

    for (const fileName of migrationFiles) {
      if (applied.has(fileName)) {
        continue;
      }

      const sql = await readFile(path.join(migrationsDir, fileName), "utf8");

      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", [fileName]);
      await client.query("COMMIT");
    }
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  const config = loadConfig();
  assertDatabaseUrl(config.databaseUrl);

  const pool = createDbPool({ databaseUrl: config.databaseUrl });

  try {
    await runMigrations({ pool });
    console.log("Migrations applied successfully.");
  } finally {
    await pool.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
