const ALLOWED_REQUESTED_ACTIONS = new Set([
  "faq_answer",
  "lead_capture",
  "pre_appointment",
  "human_handoff",
]);

export function validateModelOutput(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Model output must be an object.");
  }

  if (!payload.intent || typeof payload.intent !== "string") {
    throw new Error("Model output is missing required field: intent.");
  }

  if (!payload.reply || typeof payload.reply !== "string" || !payload.reply.trim()) {
    throw new Error("Model output is missing required field: reply.");
  }

  if (!payload.requestedAction || typeof payload.requestedAction !== "string") {
    throw new Error("Model output is missing required field: requestedAction.");
  }

  if (!ALLOWED_REQUESTED_ACTIONS.has(payload.requestedAction)) {
    throw new Error("Model output has invalid requestedAction.");
  }

  if (typeof payload.confidence !== "number" || Number.isNaN(payload.confidence)) {
    throw new Error("Model output is missing required field: confidence.");
  }

  return {
    intent: payload.intent,
    reply: payload.reply.trim(),
    requestedAction: payload.requestedAction,
    entities: payload.entities && typeof payload.entities === "object" ? payload.entities : {},
    confidence: payload.confidence,
    fallbackReason: payload.fallbackReason ?? null,
  };
}
