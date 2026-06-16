function getApiBaseUrl() {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

  if (!apiBaseUrl) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL is required for the admin app.");
  }

  return apiBaseUrl.replace(/\/$/, "");
}

export async function apiRequest(pathname, { method = "GET", body, token, tenantId } = {}) {
  const headers = {};

  if (body) {
    headers["content-type"] = "application/json";
  }

  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  if (tenantId) {
    headers["x-tenant-id"] = tenantId;
  }

  const response = await fetch(`${getApiBaseUrl()}${pathname}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error ?? "API request failed.");
  }

  return payload;
}
