import test from "node:test";
import assert from "node:assert/strict";

import { createWhatsAppCloudClient } from "../../src/whatsapp/whatsapp-cloud-client.js";

test("createWhatsAppCloudClient sends a WhatsApp text payload to the Meta API", async () => {
  const calls = [];
  const client = createWhatsAppCloudClient({
    accessToken: "meta-token",
    phoneNumberId: "phone-number-id",
    logger: { info() {} },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });

      return {
        ok: true,
        async json() {
          return {
            messages: [{ id: "wamid-outbound-1" }],
          };
        },
      };
    },
  });

  const result = await client.sendTextMessage({
    tenantId: "tenant-1",
    customerPhone: "5511988887777",
    text: "Aceitamos Pix.",
    conversationId: "conversation-1",
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://graph.facebook.com/v23.0/phone-number-id/messages");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers.authorization, "Bearer meta-token");
  assert.equal(calls[0].options.headers["content-type"], "application/json");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    messaging_product: "whatsapp",
    to: "5511988887777",
    type: "text",
    text: {
      body: "Aceitamos Pix.",
    },
  });
  assert.equal(result.messages[0].id, "wamid-outbound-1");
});

test("createWhatsAppCloudClient throws provider details when the Meta API rejects the request", async () => {
  const client = createWhatsAppCloudClient({
    accessToken: "meta-token",
    phoneNumberId: "phone-number-id",
    logger: { info() {} },
    fetchImpl: async () => ({
      ok: false,
      status: 400,
      async text() {
        return JSON.stringify({ error: { message: "Invalid recipient" } });
      },
    }),
  });

  await assert.rejects(
    () =>
      client.sendTextMessage({
        tenantId: "tenant-1",
        customerPhone: "5511988887777",
        text: "Aceitamos Pix.",
        conversationId: "conversation-1",
      }),
    (error) => {
      assert.equal(error.message, "WhatsApp Cloud API outbound request failed.");
      assert.equal(error.statusCode, 400);
      assert.match(error.providerBody, /Invalid recipient/);
      return true;
    },
  );
});
