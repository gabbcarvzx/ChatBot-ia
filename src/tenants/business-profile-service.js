export function createBusinessProfileService({ businessProfileRepository, tenantRepository }) {
  async function getProfile(tenantId) {
    const [profile, tenant] = await Promise.all([
      businessProfileRepository.findByTenantId(tenantId),
      tenantRepository.findById(tenantId),
    ]);

    if (!profile) {
      throw createHttpError(404, "Business profile was not found for this tenant.");
    }

    return structuredClone({
      ...profile,
      businessWhatsApp: tenant?.businessWhatsApp ?? null,
    });
  }

  async function updateProfile(tenantId, payload) {
    const profile = await getProfile(tenantId);

    const nextProfile = {
      businessName: payload.businessName ?? profile.businessName,
      description: payload.description ?? profile.description,
      locationLabel: payload.locationLabel ?? profile.locationLabel,
      fullAddress: payload.fullAddress ?? profile.fullAddress,
      paymentMethods: Array.isArray(payload.paymentMethods)
        ? [...payload.paymentMethods]
        : profile.paymentMethods,
      businessWhatsApp: payload.businessWhatsApp ?? profile.businessWhatsApp,
    };

    const [updatedProfile, tenant] = await Promise.all([
      businessProfileRepository.updateByTenantId(tenantId, nextProfile),
      tenantRepository.updateBusinessWhatsApp(null, tenantId, nextProfile.businessWhatsApp),
    ]);

    return structuredClone({
      ...updatedProfile,
      businessWhatsApp: tenant?.businessWhatsApp ?? null,
    });
  }

  return {
    getProfile,
    updateProfile,
  };
}

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
