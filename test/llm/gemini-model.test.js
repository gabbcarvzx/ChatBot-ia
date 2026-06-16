import test from "node:test";
import assert from "node:assert/strict";

import { createGeminiModel } from "../../src/llm/gemini-model.js";

function createNoopLogger() {
  return {
    info() {},
    error() {},
  };
}

test("createGeminiModel parses valid JSON text into model output", async () => {
  const model = createGeminiModel({
    apiKey: "test-key",
    model: "gemini-test",
    logger: createNoopLogger(),
    clientFactory: () => ({
      models: {
        generateContent: async () => ({
          text: JSON.stringify({
            intent: "faq",
            reply: "Aceitamos Pix.",
            requestedAction: "faq_answer",
            entities: {},
            confidence: 0.91,
            fallbackReason: null,
          }),
        }),
      },
    }),
  });

  const result = await model({
    systemPolicy: "policy",
    input: { customerMessage: "Aceita Pix?" },
  });

  assert.equal(result.requestedAction, "faq_answer");
  assert.equal(result.reply, "Aceitamos Pix.");
});

test("createGeminiModel throws when Gemini returns invalid JSON", async () => {
  const model = createGeminiModel({
    apiKey: "test-key",
    model: "gemini-test",
    logger: createNoopLogger(),
    clientFactory: () => ({
      models: {
        generateContent: async () => ({
          text: "not-json",
        }),
      },
    }),
  });

  await assert.rejects(
    () =>
      model({
        systemPolicy: "policy",
        input: { customerMessage: "Aceita Pix?" },
      }),
    /invalid json/i,
  );
});
