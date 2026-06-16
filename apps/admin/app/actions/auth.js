"use server";

import { redirect } from "next/navigation";

import { apiRequest } from "@/lib/backend";
import { clearSession, createSession } from "@/lib/session";

export async function loginAction(_previousState, formData) {
  try {
    const payload = await apiRequest("/v1/auth/login", {
      method: "POST",
      body: {
        email: formData.get("email"),
        password: formData.get("password"),
      },
    });

    await createSession({
      accessToken: payload.accessToken,
      tenantId: payload.tenant.id,
      userEmail: payload.user.email,
    });
  } catch (error) {
    return { error: error.message };
  }

  redirect("/dashboard");
}

export async function registerAction(_previousState, formData) {
  try {
    const payload = await apiRequest("/v1/auth/register", {
      method: "POST",
      body: {
        ownerName: formData.get("ownerName"),
        email: formData.get("email"),
        password: formData.get("password"),
        companyName: formData.get("companyName"),
        companySlug: formData.get("companySlug"),
        vertical: formData.get("vertical"),
        planCode: formData.get("planCode"),
      },
    });

    await createSession({
      accessToken: payload.accessToken,
      tenantId: payload.tenant.id,
      userEmail: payload.user.email,
    });
  } catch (error) {
    return { error: error.message };
  }

  redirect("/dashboard");
}

export async function logoutAction() {
  await clearSession();
  redirect("/login");
}
