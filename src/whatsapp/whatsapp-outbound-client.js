export function createWhatsAppOutboundClient({ logger }) {
  return {
    async sendTextMessage({ tenantId, customerPhone, text, conversationId }) {
      logger.info("Prepared WhatsApp outbound stub message.", {
        tenantId,
        customerPhone,
        text,
        conversationId,
      });

      return {
        accepted: true,
        provider: "whatsapp_stub",
      };
    },
  };
}
