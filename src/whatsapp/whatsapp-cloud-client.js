export function createWhatsAppCloudClient({
  accessToken,
  phoneNumberId,
  logger,
  fetchImpl = fetch,
}) {
  if (!accessToken) {
    throw createConfigError("WHATSAPP_CLOUD_API_TOKEN is not configured.");
  }

  if (!phoneNumberId) {
    throw createConfigError("WHATSAPP_CLOUD_API_PHONE_NUMBER_ID is not configured.");
  }

  return {
    async sendTextMessage({ tenantId, customerPhone, text, conversationId }) {
      const response = await fetchImpl(
        `https://graph.facebook.com/v23.0/${phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: customerPhone,
            type: "text",
            text: {
              body: text,
            },
          }),
        },
      );

      if (!response.ok) {
        const providerBody = await response.text();
        const error = new Error("WhatsApp Cloud API outbound request failed.");
        error.statusCode = response.status;
        error.providerBody = providerBody;
        throw error;
      }

      const payload = await response.json();

      logger?.info?.("Delivered WhatsApp outbound message.", {
        tenantId,
        conversationId,
        customerPhone,
        phoneNumberId,
        providerMessageId: payload?.messages?.[0]?.id ?? null,
      });

      return payload;
    },
  };
}

function createConfigError(message) {
  const error = new Error(message);
  error.statusCode = 500;
  return error;
}
