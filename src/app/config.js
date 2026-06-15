function readInt(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function loadConfig(env = process.env) {
  return {
    appEnv: env.NODE_ENV ?? "development",
    port: readInt(env.PORT, 3000),
    authSecret: env.AUTH_SECRET ?? "dev-auth-secret-change-me",
    logLevel: env.LOG_LEVEL ?? "info",
  };
}
