import { randomUUID } from "node:crypto";

import { hashPassword, verifyPassword } from "./passwords.js";

export function createAuthService({
  pool,
  tenantRepository,
  userRepository,
  businessProfileRepository,
  tokenService,
}) {
  async function registerOwner(input) {
    const email = input.email.trim().toLowerCase();
    const slug = input.companySlug.trim().toLowerCase();

    const existingUser = await userRepository.findByEmail(email);
    if (existingUser) {
      throw createHttpError(409, "Email is already registered.");
    }

    const existingTenant = await tenantRepository.findBySlug(slug);
    if (existingTenant) {
      throw createHttpError(409, "Company slug is already in use.");
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const tenant = await tenantRepository.create(client, {
        id: randomUUID(),
        name: input.companyName.trim(),
        slug,
        vertical: input.vertical,
        planCode: input.planCode,
        subscriptionStatus: "trial",
        businessWhatsApp: input.businessWhatsApp ?? null,
      });

      const user = await userRepository.create(client, {
        id: randomUUID(),
        tenantId: tenant.id,
        ownerName: input.ownerName.trim(),
        email,
        passwordHash: hashPassword(input.password),
        role: "owner",
      });

      await businessProfileRepository.create(client, {
        id: randomUUID(),
        tenantId: tenant.id,
        businessName: tenant.name,
        description: null,
        locationLabel: null,
        fullAddress: null,
        paymentMethods: [],
      });

      await client.query("COMMIT");

      const accessToken = tokenService.sign({
        sub: user.id,
        tenantId: tenant.id,
        role: user.role,
        email: user.email,
      });

      return {
        accessToken,
        user: sanitizeUser(user),
        tenant: sanitizeTenant(tenant),
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});

      if (isUniqueViolation(error)) {
        throw mapUniqueViolation(error);
      }

      throw error;
    } finally {
      client.release();
    }
  }

  async function login({ email, password }) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await userRepository.findByEmail(normalizedEmail);

    if (!user) {
      throw createHttpError(401, "Invalid credentials.");
    }

    if (!verifyPassword(password, user.passwordHash)) {
      throw createHttpError(401, "Invalid credentials.");
    }

    const tenant = await tenantRepository.findById(user.tenantId);

    if (!tenant) {
      throw createHttpError(401, "Access token subject is no longer valid.");
    }

    const accessToken = tokenService.sign({
      sub: user.id,
      tenantId: tenant.id,
      role: user.role,
      email: user.email,
    });

    return {
      accessToken,
      user: sanitizeUser(user),
      tenant: sanitizeTenant(tenant),
    };
  }

  async function authenticateBearerToken(token) {
    const claims = tokenService.verify(token);

    if (!claims) {
      throw createHttpError(401, "Invalid access token.");
    }

    const user = await userRepository.findById(claims.sub);
    const tenant = await tenantRepository.findById(claims.tenantId);

    if (!user || !tenant) {
      throw createHttpError(401, "Access token subject is no longer valid.");
    }

    return {
      user: sanitizeUser(user),
      tenant: sanitizeTenant(tenant),
      claims,
    };
  }

  return {
    registerOwner,
    login,
    authenticateBearerToken,
  };
}

function sanitizeUser(user) {
  return {
    id: user.id,
    tenantId: user.tenantId,
    ownerName: user.ownerName,
    email: user.email,
    role: user.role,
  };
}

function sanitizeTenant(tenant) {
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    vertical: tenant.vertical,
    planCode: tenant.planCode,
    subscriptionStatus: tenant.subscriptionStatus,
  };
}

function isUniqueViolation(error) {
  return error?.code === "23505";
}

function mapUniqueViolation(error) {
  if (error.constraint?.includes("slug")) {
    return createHttpError(409, "Company slug is already in use.");
  }

  return createHttpError(409, "Email is already registered.");
}

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
