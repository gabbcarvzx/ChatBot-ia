import test from "node:test";
import assert from "node:assert/strict";

import { loadConfig } from "../../src/app/config.js";

test("loadConfig exposes Gemini runtime settings", () => {
  const config = loadConfig({
    GEMINI_API_KEY: "gemini-key",
    GEMINI_MODEL: "gemini-2.0-flash-lite",
  });

  assert.equal(config.geminiApiKey, "gemini-key");
  assert.equal(config.geminiModel, "gemini-2.0-flash-lite");
});
