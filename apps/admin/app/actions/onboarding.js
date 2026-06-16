"use server";

import { redirect } from "next/navigation";

import { apiRequest } from "@/lib/backend";
import { requireSession } from "@/lib/session";

export async function saveProfileAction(_previousState, formData) {
  const session = await requireSession();

  try {
    await apiRequest("/v1/business-profile", {
      method: "PUT",
      token: session.accessToken,
      tenantId: session.tenantId,
      body: {
        businessName: formData.get("businessName"),
        description: formData.get("description"),
        locationLabel: formData.get("locationLabel"),
        fullAddress: formData.get("fullAddress"),
        paymentMethods: String(formData.get("paymentMethods") ?? "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      },
    });
  } catch (error) {
    return { error: error.message };
  }

  redirect("/onboarding");
}

export async function saveHoursAction(_previousState, formData) {
  const session = await requireSession();

  try {
    await apiRequest("/v1/business-hours", {
      method: "PUT",
      token: session.accessToken,
      tenantId: session.tenantId,
      body: {
        hours: [
          {
            weekday: Number(formData.get("weekday")),
            opensAt: formData.get("opensAt") || null,
            closesAt: formData.get("closesAt") || null,
            isClosed: false,
          },
        ],
      },
    });
  } catch (error) {
    return { error: error.message };
  }

  redirect("/onboarding");
}

export async function createFaqAction(_previousState, formData) {
  const session = await requireSession();

  try {
    await apiRequest("/v1/faq-items", {
      method: "POST",
      token: session.accessToken,
      tenantId: session.tenantId,
      body: {
        question: formData.get("question"),
        answer: formData.get("answer"),
      },
    });
  } catch (error) {
    return { error: error.message };
  }

  redirect("/onboarding");
}

export async function createCatalogItemAction(_previousState, formData) {
  const session = await requireSession();

  try {
    await apiRequest("/v1/catalog-items", {
      method: "POST",
      token: session.accessToken,
      tenantId: session.tenantId,
      body: {
        itemType: formData.get("itemType"),
        name: formData.get("name"),
        description: formData.get("description"),
        priceCents: Number(formData.get("priceCents") || 0),
      },
    });
  } catch (error) {
    return { error: error.message };
  }

  redirect("/onboarding");
}
