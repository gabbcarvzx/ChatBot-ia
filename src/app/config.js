function readInt(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function loadConfig(env = process.env) {
  return {
    appEnv: env.NODE_ENV ?? "development",
    port: readInt(env.PORT, 3000),
    authSecret: env.AUTH_SECRET ?? "dev-auth-secret-change-me",
    asaasWebhookSecret: env.ASAAS_WEBHOOK_SECRET ?? "",
    geminiApiKey: env.GEMINI_API_KEY ?? "",
    geminiModel: env.GEMINI_MODEL ?? "",
    whatsappCloudApiToken: env.WHATSAPP_CLOUD_API_TOKEN ?? "",
    whatsappCloudApiPhoneNumberId: env.WHATSAPP_CLOUD_API_PHONE_NUMBER_ID ?? "",
    whatsappCloudApiVerifyToken: env.WHATSAPP_CLOUD_API_VERIFY_TOKEN ?? "",
    logLevel: env.LOG_LEVEL ?? "info",
    databaseUrl: env.DATABASE_URL ?? "",
  };
}
