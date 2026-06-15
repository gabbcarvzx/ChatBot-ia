export function loadDatabaseConfig(env = process.env) {
  return {
    databaseUrl: env.DATABASE_URL ?? "",
  };
}

export function assertDatabaseUrl(databaseUrl) {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to start the database-backed application.");
  }
}
