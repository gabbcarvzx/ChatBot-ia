import { validateModelOutput } from "./model-output-validator.js";

export function createGeminiModel({ apiKey, model, logger, clientFactory } = {}) {
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  if (!model) {
    throw new Error("GEMINI_MODEL is not configured.");
  }

  const createClient = clientFactory ?? createDefaultClientFactory(apiKey);

  return async function generateStructuredReply({ systemPolicy, input }) {
    const startedAt = Date.now();
    const client = await createClient();
    const response = await client.models.generateContent({
      model,
      contents: buildPrompt({ systemPolicy, input }),
    });
    const text = extractResponseText(response);

    try {
      const parsed = JSON.parse(text);
      const result = validateModelOutput(parsed);

      logger?.info?.("Gemini model output accepted.", {
        provider: "gemini",
        model,
        latencyMs: Date.now() - startedAt,
        resultStatus: "accepted",
      });

      return result;
    } catch (error) {
      logger?.error?.("Gemini model output rejected.", {
        provider: "gemini",
        model,
        latencyMs: Date.now() - startedAt,
        resultStatus: "invalid_output",
        errorMessage: error.message,
      });

      throw new Error(`Gemini returned invalid JSON output: ${error.message}`);
    }
  };
}

function buildPrompt({ systemPolicy, input }) {
  return [
    `${systemPolicy}\n`,
    "Return only valid JSON. Do not wrap the response in markdown fences.\n",
    "Use this schema exactly:\n",
    JSON.stringify(input.outputSchema),
    "\nTenant-scoped input:\n",
    JSON.stringify(input),
  ].join("");
}

function extractResponseText(response) {
  if (typeof response?.text === "string") {
    return response.text;
  }

  if (typeof response?.text === "function") {
    return response.text();
  }

  throw new Error("Gemini response did not include text output.");
}

function createDefaultClientFactory(apiKey) {
  let cachedClientPromise;

  return async () => {
    if (!cachedClientPromise) {
      cachedClientPromise = import("@google/genai").then(({ GoogleGenAI }) => new GoogleGenAI({ apiKey }));
    }

    return cachedClientPromise;
  };
}
