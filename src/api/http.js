import { createServer as createNodeServer } from "node:http";

import { loadConfig } from "../app/config.js";
import { createMemoryStore } from "../app/memory-store.js";
import { createAuthService } from "../auth/auth-service.js";
import { createTokenService } from "../auth/token-service.js";
import { createLogger } from "../observability/logger.js";
import { createBusinessProfileService } from "../tenants/business-profile-service.js";

export function createHttpApp() {
  const config = loadConfig();
  const logger = createLogger(config);
  const store = createMemoryStore();
  const tokenService = createTokenService(config.authSecret);
  const authService = createAuthService({ store, tokenService });
  const businessProfileService = createBusinessProfileService({ store });

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
        const result = authService.registerOwner(body);
        return sendJson(response, 201, result);
      }

      if (method === "POST" && url.pathname === "/v1/auth/login") {
        const body = await readJsonBody(request);
        validateLoginPayload(body);
        const result = authService.login(body);
        return sendJson(response, 200, result);
      }

      if (url.pathname === "/v1/business-profile") {
        const session = requireSession(request, authService);
        requireTenantHeader(request, session.tenant.id);

        if (method === "GET") {
          const profile = businessProfileService.getProfile(session.tenant.id);
          return sendJson(response, 200, profile);
        }

        if (method === "PUT") {
          const body = await readJsonBody(request);
          const profile = businessProfileService.updateProfile(session.tenant.id, body);
          return sendJson(response, 200, profile);
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
    store,
    handle,
  };
}

export function createHttpServer() {
  const app = createHttpApp();
  return createNodeServer((request, response) => app.handle(request, response));
}

function requireSession(request, authService) {
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
