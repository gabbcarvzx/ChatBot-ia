import { hashPassword, verifyPassword } from "./passwords.js";

export function createAuthService({ store, tokenService }) {
  function registerOwner(input) {
    const email = input.email.trim().toLowerCase();
    const slug = input.companySlug.trim().toLowerCase();

    if (store.usersByEmail.has(email)) {
      throw createHttpError(409, "Email is already registered.");
    }

    if (store.tenantsBySlug.has(slug)) {
      throw createHttpError(409, "Company slug is already in use.");
    }

    const tenant = {
      id: store.nextId(),
      name: input.companyName.trim(),
      slug,
      vertical: input.vertical,
      planCode: input.planCode,
      subscriptionStatus: "trial",
      businessWhatsApp: null,
      createdAt: new Date().toISOString(),
    };

    const user = {
      id: store.nextId(),
      tenantId: tenant.id,
      ownerName: input.ownerName.trim(),
      email,
      passwordHash: hashPassword(input.password),
      role: "owner",
      createdAt: new Date().toISOString(),
    };

    const profile = {
      tenantId: tenant.id,
      businessName: tenant.name,
      locationLabel: null,
      fullAddress: null,
      paymentMethods: [],
    };

    store.tenants.set(tenant.id, tenant);
    store.tenantsBySlug.set(tenant.slug, tenant.id);
    store.users.set(user.id, user);
    store.usersByEmail.set(user.email, user.id);
    store.businessProfiles.set(tenant.id, profile);

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

  function login({ email, password }) {
    const normalizedEmail = email.trim().toLowerCase();
    const userId = store.usersByEmail.get(normalizedEmail);

    if (!userId) {
      throw createHttpError(401, "Invalid credentials.");
    }

    const user = store.users.get(userId);

    if (!verifyPassword(password, user.passwordHash)) {
      throw createHttpError(401, "Invalid credentials.");
    }

    const tenant = store.tenants.get(user.tenantId);
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

  function authenticateBearerToken(token) {
    const claims = tokenService.verify(token);

    if (!claims) {
      throw createHttpError(401, "Invalid access token.");
    }

    const user = store.users.get(claims.sub);
    const tenant = store.tenants.get(claims.tenantId);

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

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
