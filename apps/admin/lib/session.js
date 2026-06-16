import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const ACCESS_TOKEN_COOKIE = "atendeai_access_token";
const TENANT_ID_COOKIE = "atendeai_tenant_id";
const USER_EMAIL_COOKIE = "atendeai_user_email";

export async function createSession({ accessToken, tenantId, userEmail }) {
  const cookieStore = await cookies();

  cookieStore.set(ACCESS_TOKEN_COOKIE, accessToken, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
  });

  cookieStore.set(TENANT_ID_COOKIE, tenantId, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
  });

  cookieStore.set(USER_EMAIL_COOKIE, userEmail, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(ACCESS_TOKEN_COOKIE);
  cookieStore.delete(TENANT_ID_COOKIE);
  cookieStore.delete(USER_EMAIL_COOKIE);
}

export async function getSession() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value ?? null;
  const tenantId = cookieStore.get(TENANT_ID_COOKIE)?.value ?? null;
  const userEmail = cookieStore.get(USER_EMAIL_COOKIE)?.value ?? null;

  return {
    accessToken,
    tenantId,
    userEmail,
    isAuthenticated: Boolean(accessToken && tenantId),
  };
}

export async function requireSession() {
  const session = await getSession();

  if (!session.isAuthenticated) {
    redirect("/login");
  }

  return session;
}
