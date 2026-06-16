# WhatsApp Cloud Outbound Design

## Objective

Replace the current outbound stub with a real WhatsApp Cloud API adapter, while preserving:

- strict tenant isolation
- the current inbound webhook/runtime flow
- safe failure handling without automatic retry
- low operational complexity for the MVP

This slice turns the existing WhatsApp runtime into a real customer-facing delivery path. The product already receives inbound messages, evaluates plan and billing rules, runs Gemini, and persists commercial actions. What is missing is actual delivery to the end user on WhatsApp.

## Decisions Locked

- outbound transport: real WhatsApp Cloud API
- integration pattern: adapter behind the existing outbound interface
- tenant transport model: one shared Meta phone number per environment for now
- failure behavior: log and stop, with no automatic retry in this slice
- webhook behavior on outbound failure: do not fail inbound ingestion because of outbound delivery errors

## Problem Statement

The current runtime persists the outbound message and prepares a reply, but the transport is still a stub. That means:

- customers do not receive the bot response in the real channel
- the MVP cannot be validated operationally with real tenants
- commercial value is blocked even though the backend pipeline is already functional

For the next stage of the MVP, the system needs to deliver real text responses through the Meta API without coupling transport concerns into the domain.

## Scope

### In Scope

- add a real WhatsApp Cloud outbound client
- send text replies to the customer through the Meta Graph API
- keep `GET /v1/webhooks/whatsapp` and `POST /v1/webhooks/whatsapp` contracts intact
- preserve safe webhook completion even when outbound delivery fails
- add tests for success and failure behavior
- update docs and runtime configuration references

### Out of Scope

- automatic retry
- outbound delivery queue
- outbound idempotency keys
- media messages, templates, buttons, or interactive payloads
- per-tenant Meta credentials
- delivery receipt reconciliation

## Recommended Architecture

### Transport Boundary

Keep `src/whatsapp/whatsapp-service.js` as the orchestration layer and replace the stub transport with a concrete adapter:

- `src/whatsapp/whatsapp-cloud-client.js`

The adapter should expose:

- `sendTextMessage({ tenant, to, text })`

This keeps the WhatsApp transport separate from:

- tenant resolution
- domain policy enforcement
- Gemini integration
- commercial persistence

### Runtime Flow

The runtime should continue to execute in this order:

1. receive inbound webhook payload
2. resolve tenant from the connected number
3. enforce plan, billing, and quota rules
4. build the outbound text
5. persist the outbound message in `messages`
6. attempt delivery through the WhatsApp Cloud API adapter
7. log success or failure
8. return `202` to the webhook caller

Outbound failure must not invalidate the already-processed inbound business event.

## Configuration Model

The implementation should use the existing environment variables:

- `WHATSAPP_CLOUD_API_TOKEN`
- `WHATSAPP_CLOUD_API_PHONE_NUMBER_ID`
- `WHATSAPP_CLOUD_API_VERIFY_TOKEN`

### Single Number Constraint

For this MVP slice, one Meta phone number is shared by the whole environment. This is acceptable because:

- the current tenant resolution already happens on inbound using the business number stored for the tenant
- only one live sending identity exists today
- introducing per-tenant transport credentials now would add complexity without current business value

This design must keep the outbound client small enough that a future per-tenant credential resolver can replace the global config later.

## API Contract

### Meta Request

The adapter should send a `POST` request to:

- `https://graph.facebook.com/v23.0/{phone-number-id}/messages`

With:

- `Authorization: Bearer <token>`
- `Content-Type: application/json`

And a JSON payload shaped for a plain text WhatsApp message:

- `messaging_product: "whatsapp"`
- `to`
- `type: "text"`
- `text.body`

This slice should only support outbound text.

## Failure Handling

### Expected Behavior

If the Meta API responds with a non-success status or the request throws:

- log a structured error
- include `tenantId`, `conversationId`, `customerPhone`, `phoneNumberId`, HTTP status when available, and the provider error body when available
- do not retry automatically
- do not return `500` to the inbound webhook caller solely because outbound delivery failed

### Why This Is Correct For The MVP

The inbound webhook is the source event that drives business state. By the time outbound happens, the inbound message, conversation, and any accepted commercial action may already be validly persisted. Failing the whole webhook request because the send failed would create a higher risk of duplicate processing and harder operational debugging.

## Security And Tenant Isolation

### Mandatory Rules

- no outbound send occurs before tenant resolution
- every log entry must remain tenant-scoped
- the outbound transport must never derive tenant identity from model output
- the destination phone must come from the normalized inbound conversation context, not from Gemini entities
- the global Meta token must stay in backend-only configuration

### Known Limitation

Because one shared sender number is used across the environment, this slice is operationally single-line even though the rest of the product is multi-tenant. This is acceptable short term, but it must remain isolated behind the outbound adapter so multi-number routing can be added later without rewriting the runtime.

## Testing Strategy

### Unit And Service Tests

Add coverage for:

- successful outbound send through the adapter contract
- outbound API failure still returning safe webhook completion
- unknown tenant continuing without outbound send
- verification endpoint remaining unchanged

### HTTP/API Tests

Add or update tests to verify:

- `POST /v1/webhooks/whatsapp` still returns `202` after a successful real-client invocation
- `POST /v1/webhooks/whatsapp` still returns `202` when outbound delivery fails but inbound processing is otherwise valid

### Config Tests

Ensure startup/config validation exposes the required WhatsApp outbound variables clearly enough for local setup and production deployment.

## Delivery Sequence

1. add tests for outbound success and failure behavior
2. implement the WhatsApp Cloud API adapter
3. wire the adapter into `src/api/http.js`
4. replace the stub dependency in the WhatsApp service path
5. run full test verification
6. update architecture and README references

## Trade-Offs

### Chosen Trade-Off

Synchronous outbound delivery in the webhook request is the simplest path that creates real product value now. It avoids early queue complexity and keeps the runtime understandable and testable.

### Rejected Trade-Off

Retry logic was intentionally deferred. Without a proper outbound idempotency model, queue semantics, and delivery observability, immediate retry would create more risk than reliability.

## Implementation Readiness Verdict

This slice is ready for implementation.

It directly unlocks real WhatsApp conversation delivery, keeps the architecture modular, and does not weaken the current tenant, billing, or policy boundaries.
