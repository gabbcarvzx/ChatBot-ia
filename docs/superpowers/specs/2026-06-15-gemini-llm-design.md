# Gemini LLM Integration Design

## Objective

Integrate a low-cost Gemini model into the WhatsApp runtime so AtendeAI can move from message persistence to a real tenant-scoped conversational pipeline, while preserving:

- strict multi-tenant isolation
- backend enforcement of plan and subscription rules
- safe fallback when model output is invalid or low-confidence
- provider abstraction for future LLM swaps

This design covers only the LLM integration slice for the MVP runtime. It does not include a real WhatsApp outbound provider, inbox UI, or Asaas subscription creation.

## Decisions Locked

- LLM provider for this slice: Gemini Developer API
- SDK approach: `@google/genai`
- model strategy: use the low-cost model already configured in environment variables
- output strategy: JSON-only structured response
- invalid output strategy: immediate human handoff
- low confidence strategy: immediate human handoff
- plan enforcement: always validated in backend, never trusted from model

## Problem Statement

The repository already persists WhatsApp inbound events, conversations, and messages tenant-scoped, but the reply pipeline still uses an outbound stub with a fixed text response. That means the product still does not deliver conversational value to end customers and cannot capture leads or pre-appointments.

The next commercially relevant step is to connect:

1. tenant-approved business context
2. domain policy and plan enforcement
3. a real LLM provider
4. safe structured output validation

This must happen without allowing model output to bypass tenant isolation, invent tenant data, or trigger business actions outside the subscribed plan.

## Scope

### In Scope

- add a concrete Gemini adapter behind a provider interface
- wire the adapter into the WhatsApp processing runtime
- enforce JSON structured output
- validate model output server-side before accepting actions
- return safe human handoff on invalid JSON, low confidence, or invalid actions
- prepare config and logging needed for production-ready runtime evolution
- add automated tests for the runtime path

### Out of Scope

- real outbound delivery through WhatsApp Cloud API
- token cost accounting persistence
- lead repository writes if not already present in the runtime slice
- pre-appointment repository writes if not already present in the runtime slice
- inbox UI for captured records
- retries, queues, and async worker infrastructure

## Recommended Architecture

### Layer Boundaries

#### `src/domain/`

Remains provider-agnostic. The domain continues to accept a `model` function and remains responsible for:

- building model input
- applying subscription and quota access rules
- validating the requested action against the tenant plan
- returning accepted, blocked, or handoff decisions

The domain must not import Gemini SDK code.

#### `src/llm/`

Owns provider-specific behavior. This layer will contain:

- Gemini client creation
- request assembly for Gemini Developer API
- JSON parsing and schema-shape validation
- normalization into the model contract expected by the domain

Suggested files:

- `src/llm/gemini-client.js`
- `src/llm/gemini-model.js`
- `src/llm/model-output-validator.js`

#### `src/whatsapp/`

Owns runtime orchestration around inbound messages. This layer will:

- load the tenant-scoped runtime context
- call the domain orchestrator with the Gemini-backed model function
- persist outbound messages
- send the final reply through the existing outbound client abstraction

Suggested runtime direction:

`webhook -> tenant resolution -> event/message persistence -> tenant context load -> processInboundMessage -> persist outbound -> outbound client`

### Why This Boundary Is Recommended

This keeps the architecture commercially safe and evolvable:

- changing Gemini model name does not affect domain code
- replacing Gemini with another provider later does not force runtime rewrites
- tests can validate policy and fallback logic without real provider calls
- tenant data exposure remains controlled by backend-built context only

## Runtime Flow

For each inbound WhatsApp text message:

1. Resolve tenant by connected business WhatsApp number.
2. Persist raw event with idempotency.
3. Persist or update the conversation.
4. Persist the inbound message.
5. Load tenant-scoped approved context:
   - business profile
   - business hours
   - FAQ
   - catalog/services
   - plan and subscription status
6. Build model input using the existing contract.
7. Call Gemini with system policy plus structured JSON response instructions.
8. Parse and validate the JSON response.
9. Pass the normalized output through domain validation.
10. If accepted, prepare the business action payload.
11. If rejected for confidence, schema, or policy reason, convert to human handoff.
12. Persist outbound message content.
13. Send outbound message through the current outbound client abstraction.
14. Log the result with `tenantId` and `conversationId`.

## Data and Tenant Isolation

The LLM integration must preserve the existing isolation rules.

### Mandatory Rules

- only tenant-approved data can be included in model input
- all loaded context must already be filtered by `tenantId`
- no cross-tenant repository query may be introduced
- no model-generated field may be trusted without backend validation
- no lead or pre-appointment action may be persisted unless tenant plan allows it

### Isolation Risk to Avoid

The main risk is accidental context overloading from unscoped repositories. To avoid that, the WhatsApp runtime must only consume services/repositories that explicitly query by `tenantId`.

If any runtime context loader cannot guarantee `tenantId` filtering, implementation must stop and fix that before Gemini is wired in.

## Gemini Request Strategy

### Request Shape

The Gemini adapter should send:

- a system-style instruction based on the existing LLM policy
- the tenant-scoped structured input payload
- an explicit instruction to return only valid JSON with no markdown

### Output Contract

Gemini must return a JSON object that maps to:

- `intent`
- `reply`
- `requestedAction`
- `entities`
- `confidence`
- `fallbackReason`

### Validation Policy

The adapter must reject responses when:

- JSON cannot be parsed
- required fields are missing
- `reply` is empty
- `confidence` is not numeric
- `requestedAction` is not one of the allowed contract values

The adapter should return a normalized fallback-safe object or throw a provider-specific error that the WhatsApp runtime converts to human handoff. It must not invent a replacement action.

## Fallback Policy

### Immediate Handoff Cases

- invalid JSON from Gemini
- schema-shape mismatch
- low confidence
- model requests an action disallowed for the tenant plan
- blocked or overdue tenant access
- missing tenant business data that prevents a safe answer

### Customer-Facing Reply

The handoff message should remain neutral and operationally safe, aligned with the current domain fallback behavior:

`Vou encaminhar seu atendimento para um atendente humano continuar com voce.`

This is intentionally cheaper and safer than multi-step clarification loops in the MVP.

## Environment and Config

### New Environment Variables

- `GEMINI_API_KEY`
- `GEMINI_MODEL`

### Config Changes

`src/app/config.js` should expose these variables so the runtime can fail fast when Gemini integration is enabled but not configured.

### Failure Mode

If Gemini configuration is missing, the application should fail predictably on startup or on first runtime use with a clear operational error. It should not silently downgrade into undefined behavior.

## Logging and Observability

Minimum structured logs for each model call:

- `tenantId`
- `conversationId`
- `provider`
- `model`
- `latencyMs`
- `resultStatus`
- `fallbackReason`

This is enough for MVP troubleshooting and cost discipline without introducing token accounting complexity yet.

## Testing Strategy

### Domain Regression

Keep and extend domain tests for:

- valid accepted action
- blocked tenant
- low confidence handoff
- invalid action handoff

### Gemini Adapter Tests

Add tests for:

- valid JSON normalization
- invalid JSON fallback/error path
- missing field validation
- unsupported action validation

These tests should not require real network calls.

### WhatsApp Runtime Tests

Add tests for:

- inbound message triggers Gemini-backed processing
- accepted response persists outbound message and sends reply
- invalid Gemini output triggers handoff reply
- tenant-scoped context is loaded before model call

## Delivery Sequence

Recommended implementation order:

1. add Gemini config surface
2. add Gemini adapter and output validator
3. add tests for adapter contract
4. wire Gemini model into WhatsApp service
5. add WhatsApp runtime tests
6. update README and architecture docs if runtime surface changes materially

## Trade-Offs

### Chosen Trade-Off

Prefer backend safety over conversational flexibility.

This means the MVP may hand off more often than an aggressive chat bot, but it avoids the higher business risk of:

- fabricated commercial information
- invalid lead/pre-appointment capture
- broken tenant trust
- expensive debugging caused by loosely structured model output

### Rejected Trade-Off

Using text output plus heuristic parsing was rejected because it is cheaper to start but more expensive to operate. It increases ambiguity, weakens tests, and makes billing-safe automation harder.

## Open Follow-Up After This Slice

After this integration is stable, the next operationally meaningful blocks are:

1. real outbound delivery through WhatsApp Cloud API
2. persistence of accepted leads and pre-appointments in the runtime path
3. inbox visibility in the admin panel
4. usage metering by tenant tied to actual conversations

## Implementation Readiness Verdict

This slice is ready for implementation.

It is narrow enough for one plan, preserves tenant isolation, improves commercial usefulness, and does not introduce architectural debt that would make future provider or billing changes harder.
