import pg from "pg";

const { Pool } = pg;

export function createDbPool({ databaseUrl }) {
  return new Pool({
    connectionString: databaseUrl,
  });
}
