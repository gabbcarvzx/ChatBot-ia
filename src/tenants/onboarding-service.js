function isServiceVertical(vertical) {
  return vertical === "salao" || vertical === "clinica";
}

export function createOnboardingService({
  businessProfileService,
  businessHoursService,
  faqItemService,
  catalogItemService,
}) {
  async function getStatus(tenant) {
    const profile = await businessProfileService.getProfile(tenant.id);
    const hours = await businessHoursService.listHours(tenant.id);
    const faqItems = await faqItemService.listItems(tenant.id);
    const catalogItems = await catalogItemService.listItems(tenant.id);

    const hasProfileCore = Boolean(
      profile.businessName &&
        profile.locationLabel &&
        profile.fullAddress &&
        Array.isArray(profile.paymentMethods) &&
        profile.paymentMethods.length > 0,
    );
    const hasHours = hours.hours.length > 0;
    const hasFaq = faqItems.items.length > 0;
    const requiresServices = isServiceVertical(tenant.vertical);
    const hasCatalogSeed = catalogItems.items.some((item) =>
      requiresServices ? item.itemType === "service" : item.itemType === "product",
    );

    const completed = hasProfileCore && hasHours && hasFaq && hasCatalogSeed;

    return {
      status: completed ? "ready_for_activation" : "incomplete",
      checklist: {
        profile: hasProfileCore,
        hours: hasHours,
        faq: hasFaq,
        catalog: hasCatalogSeed,
      },
    };
  }

  return {
    getStatus,
  };
}
