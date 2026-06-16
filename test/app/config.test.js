import test from "node:test";
import assert from "node:assert/strict";

import { loadConfig } from "../../src/app/config.js";

test("loadConfig exposes Gemini runtime settings", () => {
  const config = loadConfig({
    GEMINI_API_KEY: "gemini-key",
    GEMINI_MODEL: "gemini-2.0-flash-lite",
    WHATSAPP_CLOUD_API_TOKEN: "meta-token",
    WHATSAPP_CLOUD_API_PHONE_NUMBER_ID: "phone-number-id",
  });

  assert.equal(config.geminiApiKey, "gemini-key");
  assert.equal(config.geminiModel, "gemini-2.0-flash-lite");
  assert.equal(config.whatsappCloudApiToken, "meta-token");
  assert.equal(config.whatsappCloudApiPhoneNumberId, "phone-number-id");
});
