export function createBusinessProfileService({ businessProfileRepository }) {
  async function getProfile(tenantId) {
    const profile = await businessProfileRepository.findByTenantId(tenantId);

    if (!profile) {
      throw createHttpError(404, "Business profile was not found for this tenant.");
    }

    return structuredClone(profile);
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
    };

    const updated = await businessProfileRepository.updateByTenantId(tenantId, nextProfile);
    return structuredClone(updated);
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
