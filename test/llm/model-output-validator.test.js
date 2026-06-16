import test from "node:test";
import assert from "node:assert/strict";

import { validateModelOutput } from "../../src/llm/model-output-validator.js";

test("validateModelOutput accepts a valid structured payload", () => {
  const result = validateModelOutput({
    intent: "faq",
    reply: "Atendemos de segunda a sexta.",
    requestedAction: "faq_answer",
    entities: {},
    confidence: 0.92,
    fallbackReason: null,
  });

  assert.equal(result.reply, "Atendemos de segunda a sexta.");
  assert.equal(result.requestedAction, "faq_answer");
});

test("validateModelOutput rejects unsupported requestedAction", () => {
  assert.throws(
    () =>
      validateModelOutput({
        intent: "faq",
        reply: "Resposta",
        requestedAction: "unsupported_action",
        entities: {},
        confidence: 0.92,
        fallbackReason: null,
      }),
    /requestedAction/i,
  );
});
