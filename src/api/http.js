import { createServer as createNodeServer } from "node:http";

import { loadConfig } from "../app/config.js";
import { createAuthService } from "../auth/auth-service.js";
import { createBillingService } from "../billing/billing-service.js";
import { createGeminiModel } from "../llm/gemini-model.js";
import { createTokenService } from "../auth/token-service.js";
import { assertDatabaseUrl } from "../db/config.js";
import { createDbPool } from "../db/pool.js";
import { createBusinessHoursRepository } from "../db/repositories/business-hours-repository.js";
import { createBusinessProfileRepository } from "../db/repositories/business-profile-repository.js";
import { createCatalogItemRepository } from "../db/repositories/catalog-item-repository.js";
import { createConversationRepository } from "../db/repositories/conversation-repository.js";
import { createFaqItemRepository } from "../db/repositories/faq-item-repository.js";
import { createMessageRepository } from "../db/repositories/message-repository.js";
import { createLeadRepository } from "../db/repositories/lead-repository.js";
import { createPreAppointmentRepository } from "../db/repositories/pre-appointment-repository.js";
import { createSubscriptionRepository } from "../db/repositories/subscription-repository.js";
import { createTenantRepository } from "../db/repositories/tenant-repository.js";
import { createUserRepository } from "../db/repositories/user-repository.js";
import { createWhatsappEventRepository } from "../db/repositories/whatsapp-event-repository.js";
import { createLogger } from "../observability/logger.js";
import { createBusinessHoursService } from "../tenants/business-hours-service.js";
import { createBusinessProfileService } from "../tenants/business-profile-service.js";
import { createCatalogItemService } from "../tenants/catalog-item-service.js";
import { createFaqItemService } from "../tenants/faq-item-service.js";
import { createOnboardingService } from "../tenants/onboarding-service.js";
import { createWhatsAppCloudClient } from "../whatsapp/whatsapp-cloud-client.js";
import { createWhatsAppService } from "../whatsapp/whatsapp-service.js";

export function createHttpApp(overrides = {}) {
  const config = loadConfig();
  assertDatabaseUrl(config.databaseUrl);
  const logger = createLogger(config);
  const pool = createDbPool({ databaseUrl: config.databaseUrl });
  const tokenService = createTokenService(config.authSecret);
  const tenantRepository = createTenantRepository({ pool });
  const userRepository = createUserRepository({ pool });
  const businessProfileRepository = createBusinessProfileRepository({ pool });
  const businessHoursRepository = createBusinessHoursRepository({ pool });
  const faqItemRepository = createFaqItemRepository({ pool });
  const catalogItemRepository = createCatalogItemRepository({ pool });
  const conversationRepository = createConversationRepository({ pool });
  const messageRepository = createMessageRepository({ pool });
  const leadRepository = createLeadRepository({ pool });
  const preAppointmentRepository = createPreAppointmentRepository({ pool });
  const subscriptionRepository = createSubscriptionRepository({ pool });
  const whatsappEventRepository = createWhatsappEventRepository({ pool });
  const authService = createAuthService({
    pool,
    tenantRepository,
    userRepository,
    businessProfileRepository,
    tokenService,
  });
  const businessProfileService = createBusinessProfileService({
    businessProfileRepository,
    tenantRepository,
  });
  const businessHoursService = createBusinessHoursService({ pool, businessHoursRepository });
  const faqItemService = createFaqItemService({ faqItemRepository });
  const catalogItemService = createCatalogItemService({ catalogItemRepository });
  const billingService = createBillingService({
    pool,
    tenantRepository,
    subscriptionRepository,
  });
  const llmModel =
    overrides.llmModel ??
    (config.geminiApiKey && config.geminiModel
      ? createGeminiModel({
          apiKey: config.geminiApiKey,
          model: config.geminiModel,
          logger,
        })
      : null);
  const whatsAppOutboundClient =
    overrides.whatsappOutboundClient ??
    createWhatsAppCloudClient({
      accessToken: config.whatsappCloudApiToken,
      phoneNumberId: config.whatsappCloudApiPhoneNumberId,
      logger,
    });
  const whatsAppService = createWhatsAppService({
    pool,
    tenantRepository,
    businessProfileRepository,
    businessHoursRepository,
    faqItemRepository,
    catalogItemRepository,
    conversationRepository,
    messageRepository,
    whatsappEventRepository,
    leadRepository,
    preAppointmentRepository,
    whatsappOutboundClient: whatsAppOutboundClient,
    runtimeContextLoader: createRuntimeContextLoader({
      tenantRepository,
      businessProfileRepository,
      businessHoursRepository,
      faqItemRepository,
      catalogItemRepository,
    }),
    usageLoader: async (tenantId, conversation) => ({
      monthlyConversations: await conversationRepository.countMonthlyStartedByTenant(
        tenantId,
        conversation?.startedAt ?? new Date(),
      ),
    }),
    model: llmModel,
    logger,
    verifyToken: config.whatsappCloudApiVerifyToken,
  });
  const onboardingService = createOnboardingService({
    businessProfileService,
    businessHoursService,
    faqItemService,
    catalogItemService,
  });

  async function handle(request, response) {
    try {
      const { method } = request;
      const url = new URL(request.url, "http://localhost");

      if (method === "GET" && url.pathname === "/health") {
        return sendJson(response, 200, {
          status: "ok",
          service: "atendeai-api",
          environment: config.appEnv,
        });
      }

      if (method === "POST" && url.pathname === "/v1/auth/register") {
        const body = await readJsonBody(request);
        validateRegistrationPayload(body);
        const result = await authService.registerOwner(body);
        return sendJson(response, 201, result);
      }

      if (method === "POST" && url.pathname === "/v1/auth/login") {
        const body = await readJsonBody(request);
        validateLoginPayload(body);
        const result = await authService.login(body);
        return sendJson(response, 200, result);
      }

      if (method === "POST" && url.pathname === "/v1/webhooks/asaas") {
        requireAsaasWebhookSecret(request, config.asaasWebhookSecret);
        const body = await readJsonBody(request);
        const result = await billingService.syncAsaasWebhook(body);
        logger.info("Processed Asaas webhook.", {
          tenantId: result.tenantId,
          subscriptionStatus: result.status,
          planCode: result.planCode,
        });
        return sendJson(response, 202, result);
      }

      if (method === "GET" && url.pathname === "/v1/webhooks/whatsapp") {
        const challenge = await whatsAppService.verifyWebhook({
          mode: url.searchParams.get("hub.mode"),
          verifyToken: url.searchParams.get("hub.verify_token"),
          challenge: url.searchParams.get("hub.challenge"),
        });

        response.writeHead(200, {
          "content-type": "text/plain; charset=utf-8",
        });
        response.end(challenge);
        return;
      }

      if (method === "POST" && url.pathname === "/v1/webhooks/whatsapp") {
        const body = await readJsonBody(request);
        const result = await whatsAppService.ingestWebhook(body);
        return sendJson(response, 202, result);
      }

      if (url.pathname === "/v1/business-profile") {
        const session = await requireSession(request, authService);
        requireTenantHeader(request, session.tenant.id);

        if (method === "GET") {
          const profile = await businessProfileService.getProfile(session.tenant.id);
          return sendJson(response, 200, profile);
        }

        if (method === "PUT") {
          const body = await readJsonBody(request);
          const profile = await businessProfileService.updateProfile(session.tenant.id, body);
          return sendJson(response, 200, profile);
        }
      }

      if (url.pathname === "/v1/business-hours") {
        const session = await requireSession(request, authService);
        requireTenantHeader(request, session.tenant.id);

        if (method === "GET") {
          const hours = await businessHoursService.listHours(session.tenant.id);
          return sendJson(response, 200, hours);
        }

        if (method === "PUT") {
          const body = await readJsonBody(request);
          const hours = await businessHoursService.replaceHours(session.tenant.id, body);
          return sendJson(response, 200, hours);
        }
      }

      if (url.pathname === "/v1/faq-items") {
        const session = await requireSession(request, authService);
        requireTenantHeader(request, session.tenant.id);

        if (method === "GET") {
          const items = await faqItemService.listItems(session.tenant.id);
          return sendJson(response, 200, items);
        }

        if (method === "POST") {
          const body = await readJsonBody(request);
          const item = await faqItemService.createItem(session.tenant.id, body);
          return sendJson(response, 201, item);
        }
      }

      if (url.pathname === "/v1/catalog-items") {
        const session = await requireSession(request, authService);
        requireTenantHeader(request, session.tenant.id);

        if (method === "GET") {
          const items = await catalogItemService.listItems(session.tenant.id);
          return sendJson(response, 200, items);
        }

        if (method === "POST") {
          const body = await readJsonBody(request);
          const item = await catalogItemService.createItem(session.tenant.id, body);
          return sendJson(response, 201, item);
        }
      }

      if (url.pathname === "/v1/onboarding/status") {
        const session = await requireSession(request, authService);
        requireTenantHeader(request, session.tenant.id);

        if (method === "GET") {
          const status = await onboardingService.getStatus(session.tenant);
          return sendJson(response, 200, status);
        }
      }

      if (url.pathname === "/v1/subscription") {
        const session = await requireSession(request, authService);
        requireTenantHeader(request, session.tenant.id);

        if (method === "GET") {
          const subscription = await billingService.getSubscription(session.tenant);
          return sendJson(response, 200, subscription);
        }
      }

      return sendJson(response, 404, {
        error: "Route not found.",
      });
    } catch (error) {
      const statusCode = error.statusCode ?? 500;

      if (statusCode >= 500) {
        logger.error("Unhandled request failure.", {
          errorMessage: error.message,
          stack: error.stack,
        });
      }

      return sendJson(response, statusCode, {
        error: error.message ?? "Internal server error.",
      });
    }
  }

  return {
    config,
    logger,
    pool,
    handle,
  };
}

export function createHttpServer(overrides = {}) {
  const app = createHttpApp(overrides);
  const server = createNodeServer((request, response) => app.handle(request, response));
  const originalClose = server.close.bind(server);

  server.close = (callback) =>
    originalClose((error) => {
      app.pool
        .end()
        .then(() => callback?.(error))
        .catch((poolError) => callback?.(error ?? poolError));
    });

  return server;
}

function createRuntimeContextLoader({
  tenantRepository,
  businessProfileRepository,
  businessHoursRepository,
  faqItemRepository,
  catalogItemRepository,
}) {
  return async function loadRuntimeContext(tenantId) {
    const [tenant, profile, hours, faqItems, catalogItems] = await Promise.all([
      tenantRepository.findById(tenantId),
      businessProfileRepository.findByTenantId(tenantId),
      businessHoursRepository.listByTenantId(tenantId),
      faqItemRepository.listByTenantId(tenantId),
      catalogItemRepository.listByTenantId(tenantId),
    ]);

    if (!tenant || !profile) {
      return null;
    }

    return {
      id: tenant.id,
      businessName: profile.businessName,
      vertical: tenant.vertical,
      planCode: tenant.planCode,
      subscriptionStatus: tenant.subscriptionStatus,
      hours,
      location: profile.fullAddress ?? profile.locationLabel ?? null,
      paymentMethods: profile.paymentMethods,
      faqItems,
      catalogItems,
      services: catalogItems.filter((item) => item.itemType === "service"),
    };
  };
}

async function requireSession(request, authService) {
  const authorization = request.headers.authorization ?? "";
  const [, token] = authorization.split(" ");

  if (!token) {
    throw createHttpError(401, "Missing bearer token.");
  }

  return authService.authenticateBearerToken(token);
}

function requireTenantHeader(request, expectedTenantId) {
  const tenantId = request.headers["x-tenant-id"];

  if (!tenantId) {
    throw createHttpError(400, "Missing x-tenant-id header.");
  }

  if (tenantId !== expectedTenantId) {
    throw createHttpError(403, "Tenant header does not match authenticated tenant.");
  }
}

function requireAsaasWebhookSecret(request, expectedSecret) {
  if (!expectedSecret) {
    throw createHttpError(500, "ASAAS_WEBHOOK_SECRET is not configured.");
  }

  const incomingSecret = request.headers["asaas-access-token"];

  if (!incomingSecret || incomingSecret !== expectedSecret) {
    throw createHttpError(401, "Invalid Asaas webhook secret.");
  }
}

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");

  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw createHttpError(400, "Request body must be valid JSON.");
  }
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

function validateRegistrationPayload(body) {
  const requiredFields = [
    "ownerName",
    "email",
    "password",
    "companyName",
    "companySlug",
    "vertical",
    "planCode",
  ];

  for (const field of requiredFields) {
    if (!body[field]) {
      throw createHttpError(400, `Missing required field: ${field}.`);
    }
  }
}

function validateLoginPayload(body) {
  if (!body.email || !body.password) {
    throw createHttpError(400, "Email and password are required.");
  }
}

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
