export function createBusinessProfileService({ store }) {
  function getProfile(tenantId) {
    const profile = store.businessProfiles.get(tenantId);

    if (!profile) {
      throw createHttpError(404, "Business profile was not found for this tenant.");
    }

    return structuredClone(profile);
  }

  function updateProfile(tenantId, payload) {
    const profile = getProfile(tenantId);

    const nextProfile = {
      ...profile,
      businessName: payload.businessName ?? profile.businessName,
      locationLabel: payload.locationLabel ?? profile.locationLabel,
      fullAddress: payload.fullAddress ?? profile.fullAddress,
      paymentMethods: Array.isArray(payload.paymentMethods)
        ? [...payload.paymentMethods]
        : profile.paymentMethods,
    };

    store.businessProfiles.set(tenantId, nextProfile);
    return structuredClone(nextProfile);
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
