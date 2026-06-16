# Conversation Commercial Persistence Design

## Objective

Persist accepted `lead_capture` and `pre_appointment` actions directly in the WhatsApp webhook runtime, while preserving:

- strict tenant isolation
- backend plan enforcement
- at most one lead and one pre-appointment per conversation
- safe update behavior when the same conversation provides newer information

This slice extends the current Gemini-backed runtime into commercially useful persistence without introducing asynchronous workers yet.

## Decisions Locked

- persistence timing: synchronous in the webhook request
- duplicate rule: at most one `lead` and one `pre_appointment` per `conversationId`
- duplicate handling: update existing record with the latest accepted data
- plan enforcement: action persisted only after backend validation
- failure behavior: persistence failure triggers safe handoff and structured logging

## Problem Statement

The runtime already:

- receives inbound WhatsApp messages
- resolves the tenant
- persists conversation and message history
- calls the domain orchestrator with Gemini output
- returns tenant-scoped replies

But accepted commercial actions are still transient. That means the product can classify and respond, but it does not yet capture durable commercial records for follow-up, which blocks MVP value for leads and pre-agendamentos.

## Scope

### In Scope

- add repositories for `leads` and `pre_appointments`
- add database constraints to enforce one record per conversation per tenant
- persist accepted `lead_capture`
- persist accepted `pre_appointment`
- update the existing record when the same conversation produces a newer accepted action
- add tests for create and update behavior

### Out of Scope

- inbox UI
- audit log persistence for these actions
- async worker/queue
- usage counter increments
- outbound real WhatsApp Cloud API delivery

## Recommended Architecture

### Database Constraints

Add uniqueness at the relational layer:

- `UNIQUE (tenant_id, conversation_id)` on `leads`
- `UNIQUE (tenant_id, conversation_id)` on `pre_appointments`

This is mandatory. Application logic alone is not enough because retries, duplicate webhooks, or future parallel processing could otherwise create duplicate commercial records.

### Repository Layer

Add two tenant-scoped repositories:

- `src/db/repositories/lead-repository.js`
- `src/db/repositories/pre-appointment-repository.js`

Each repository should expose an `upsertByConversation` operation scoped by:

- `tenantId`
- `conversationId`

The repositories must never query by `conversationId` alone.

### Runtime Layer

`src/whatsapp/whatsapp-service.js` remains the execution point. After `processInboundMessage` returns `accepted`, the runtime should:

1. inspect `result.action.type`
2. if `lead_capture`, upsert into `leads`
3. if `pre_appointment`, upsert into `pre_appointments`
4. persist outbound reply
5. send outbound reply

If the action is `faq_answer`, no commercial write happens.

## Behavior Rules

### Lead Capture

When `action.type === "lead_capture"`:

- create a new record if none exists for `(tenant_id, conversation_id)`
- otherwise update the existing record

Fields:

- `tenant_id`
- `conversation_id`
- `customer_name`
- `customer_phone`
- `interest_summary`
- `status`

`customer_phone` must come from the conversation, not the model.

### Pre-Appointment

When `action.type === "pre_appointment"`:

- create a new record if none exists for `(tenant_id, conversation_id)`
- otherwise update the existing record

Fields:

- `tenant_id`
- `conversation_id`
- `customer_name`
- `customer_phone`
- `requested_service`
- `preferred_date`
- `preferred_time_window`
- `notes`
- `status`

`customer_phone` must come from the conversation, not the model.

## Tenant Isolation

The persistence rules must preserve the project safety requirements.

### Mandatory Rules

- writes must always include `tenantId`
- updates must match both `tenant_id` and `conversation_id`
- no repository may update by `conversationId` alone
- no model field may decide tenant or phone identity
- plan gating remains in the domain before persistence

### Data Leakage Risk

If `upsert` were keyed only by `conversation_id`, a cross-tenant collision could corrupt commercial data. The repository and database constraint must both use `tenant_id` plus `conversation_id`.

## Failure Handling

If commercial persistence fails:

- log `tenantId`, `conversationId`, and `actionType`
- do not persist partial multi-entity state
- reply with safe human handoff

This is preferable to exposing internal failure details to the customer or claiming the lead was captured when it was not.

## Transaction Strategy

Keep inbound event/message persistence as it works today.

For this slice, commercial persistence can happen after the inbound transaction completes, but before the outbound reply is persisted and sent. If the commercial write fails, the response should degrade to handoff and still preserve the message timeline.

This keeps the MVP simpler while avoiding duplicate event persistence risks.

## Testing Strategy

### Migration Tests

Add a migration test that verifies:

- `leads` contains `UNIQUE (tenant_id, conversation_id)`
- `pre_appointments` contains `UNIQUE (tenant_id, conversation_id)`

### Repository Tests

Add tests for:

- insert new lead
- update existing lead by same conversation
- insert new pre-appointment
- update existing pre-appointment by same conversation

### Runtime Tests

Add tests for:

- accepted `lead_capture` creates commercial record
- repeated `lead_capture` updates the existing record
- accepted `pre_appointment` creates commercial record
- repeated `pre_appointment` updates the existing record
- plan-disallowed action still does not persist
- persistence failure falls back to handoff

## Delivery Sequence

1. add migration for uniqueness constraints
2. add repositories for tenant-scoped upsert
3. add repository tests
4. wire persistence into WhatsApp runtime
5. add runtime and API tests
6. update docs if the state of the MVP surface changes

## Trade-Offs

### Chosen Trade-Off

Synchronous persistence is intentionally simpler and more testable for the MVP. It increases request work slightly, but avoids the operational cost of queues and out-of-band failure handling before the product needs it.

### Rejected Trade-Off

Ignoring repeat actions was rejected because the newest accepted customer data is often the most useful operationally. Updating the existing record is a better fit for commercial follow-up.

## Implementation Readiness Verdict

This slice is ready for implementation.

It follows the planned MVP sequence, increases commercial utility immediately, and preserves the system's multi-tenant and policy boundaries.
