# Postgres Foundation Design for AtendeAI MVP

## Objective

Replace the current in-memory persistence used by the backend foundation with a real Postgres layer, while preserving strict tenant isolation and keeping the application code portable across environments. Neon will be the managed Postgres provider for development and production operations, but the backend must depend only on `DATABASE_URL` and standard Postgres behavior.

This design covers the first persistence slice of the MVP:

- owner registration
- owner login
- tenant-scoped business profile read
- tenant-scoped business profile update

The goal is to establish a safe persistence foundation that future modules can reuse for FAQ, catalog, conversations, leads, pre-appointments, billing, and audit trails.

## Scope

Included in this phase:

- introduce a Postgres connection layer using `pg`
- add migration infrastructure stored in the repository
- create a baseline migration from the current relational model
- migrate `auth-service` from memory storage to SQL repositories
- migrate `business-profile-service` from memory storage to SQL repositories
- update HTTP bootstrap to inject database-backed dependencies
- make the app consume `DATABASE_URL`
- keep tenant isolation explicit in all repository queries
- adapt tests to run against a real Postgres database

Not included in this phase:

- FAQ persistence endpoints
- catalog persistence endpoints
- WhatsApp webhooks
- LLM provider integration
- Asaas billing integration
- production deployment automation
- branch automation in Neon

## Architectural Decision

### Recommended approach

Use `pg` with SQL-first repositories and repository-local queries.

The backend remains structured in layers:

- `src/api/`: HTTP protocol and request validation
- `src/auth/`: authentication rules and token handling
- `src/tenants/`: tenant-scoped application services
- `src/db/`: Postgres configuration, pool, migration runner, and repositories

This approach is intentionally explicit. The project is still in MVP formation, and tenant safety is more important than introducing a generic data abstraction or ORM. Query visibility matters because every tenant-scoped read and write must be auditable and easy to reason about.

### Why not an ORM now

An ORM or generic DAO would reduce boilerplate, but at this stage it introduces two risks:

1. it can hide critical tenant filters behind abstractions that are harder to verify
2. it creates migration and modeling complexity before the product surface is stable

For this SaaS foundation, explicit SQL is the safer trade-off. It is easier to review for `tenant_id` correctness, uniqueness rules, and transaction boundaries.

## Neon Strategy

Neon is the operational database provider, not an application dependency.

The backend will connect through `DATABASE_URL` only. This keeps the codebase portable and avoids coupling domain code to Neon-specific tooling. Neon CLI or MCP should be used operationally to:

- provision the Neon project if needed
- create or manage branches for development and staging
- obtain the Postgres connection string
- populate local `.env` values
- run migrations against the target branch database

The schema import flow must be migration-driven. The existing `db/schema.sql` remains as a readable snapshot, but the source of truth for applied changes becomes versioned migrations in `db/migrations/`.

For the current Node runtime, using `pg.Pool` is appropriate because the application is a long-running Node server. Neon supports this connection model, and production can later move to pooled Neon connection strings as concurrency grows.

## File Structure

The following additions and changes are expected:

```text
db/
  schema.sql
  migrations/
    001_initial_schema.sql

src/
  app/
    config.js
    server.js
  api/
    http.js
  auth/
    auth-service.js
  tenants/
    business-profile-service.js
  db/
    config.js
    pool.js
    migrator.js
    repositories/
      tenant-repository.js
      user-repository.js
      business-profile-repository.js
```

`memory-store.js` will stop being part of the live HTTP bootstrap after this phase. It may be removed if nothing else depends on it.

## Persistence Model

### Core entities used in this phase

- `tenants`
- `users`
- `business_profiles`

These already exist in `db/schema.sql` and align with the current backend flows. The initial implementation should avoid widening scope beyond what the current API already exposes.

### Registration transaction

Owner registration must execute in one database transaction:

1. create tenant
2. create owner user
3. create initial business profile
4. commit only if all three succeed

This prevents partial onboarding states such as:

- tenant created without owner
- owner created without tenant profile
- business profile missing for an otherwise valid tenant

If any uniqueness or validation failure occurs, the transaction must roll back completely.

### Login resolution

Login must:

1. normalize the email
2. fetch the user record by email
3. load the linked tenant
4. validate the password hash
5. issue a tenant-bound token

The current database schema defines email uniqueness only per tenant. For the current product shape, owner login is globally email-based, so the implementation should enforce global uniqueness operationally during registration by rejecting duplicate emails across all users. This preserves the current auth contract without forcing a schema redesign in this phase.

### Business profile access

All profile access must remain tenant-scoped:

- read profile by `tenant_id`
- update profile by `tenant_id`

There must be no read or update path based on profile id alone in this phase. The authenticated tenant remains the sole scope boundary for these endpoints.

## Repository Contracts

Repository boundaries should be small and explicit.

### Tenant repository

Responsibilities:

- create tenant
- find tenant by id
- find tenant by slug

### User repository

Responsibilities:

- create user
- find user by id
- find user by normalized email

### Business profile repository

Responsibilities:

- create initial profile
- find by tenant id
- update by tenant id

Repositories should return plain JavaScript objects that the service layer can sanitize into API responses.

## Tenant Isolation Rules

These rules are mandatory and non-negotiable:

- every tenant business query must filter by `tenant_id`
- every inserted business entity must be written with `tenant_id`
- no service may infer tenant scope from client-provided profile ids
- the authenticated token tenant and `x-tenant-id` header must continue to match
- uniqueness conflicts that affect tenant onboarding must fail safely and clearly

This phase introduces no cross-tenant joins beyond loading the authenticated user's own tenant. Any future repository that joins business data must still anchor the query in `tenant_id`.

## Configuration

### Required environment variables

The app configuration should grow to include:

- `DATABASE_URL`
- optional pool tuning values if needed later

`AUTH_SECRET`, `PORT`, `NODE_ENV`, and logging config remain in place.

Configuration loading should fail fast when the database-backed app starts without `DATABASE_URL`, except in test setups that inject a specific test connection string through the same config path.

## Migrations

### Migration strategy

The migration system should be simple and repository-owned:

- SQL files live in `db/migrations/`
- a migration tracking table records which files have run
- migrations run in deterministic order by filename prefix

The first migration should capture the current relational baseline so new Neon environments can be initialized from code alone.

### Relationship with `db/schema.sql`

`db/schema.sql` remains useful as a human-readable schema snapshot. However:

- operational schema creation should use migrations
- future schema changes should be authored as new migration files
- `schema.sql` can be updated after migration changes to keep documentation aligned

This prevents drift between local assumptions and actual Neon branches.

## HTTP Bootstrap

`createHttpApp` should stop constructing an in-memory store and instead:

1. load config
2. create logger
3. create db pool
4. create repositories
5. create auth and tenant services using those repositories
6. expose the same route surface already used by tests

The HTTP contract should stay stable in this phase. This is a persistence refactor, not an API redesign.

## Testing Strategy

Tests must move from implicit in-memory isolation to explicit database isolation.

### Coverage required in this phase

- health check still works
- registration creates tenant, user, and profile
- duplicate email is rejected
- duplicate slug is rejected
- login succeeds with correct credentials
- login fails with invalid credentials
- authenticated tenant can read and update its own business profile
- authenticated tenant cannot access another tenant scope via `x-tenant-id`

### Test database handling

Tests should run against a dedicated Postgres database or Neon development branch configured by `DATABASE_URL` for the test process.

Before each test, the relevant tables should be truncated in dependency-safe order to avoid state leakage. This is sufficient for the current small test suite and avoids introducing a more complex transaction-per-test harness too early.

## Error Handling

The SQL-backed services should preserve the current HTTP behavior:

- duplicate email or slug -> `409`
- invalid credentials -> `401`
- missing token -> `401`
- tenant mismatch -> `403`
- missing business profile -> `404`
- invalid JSON or payload -> `400`

Database constraint errors should be translated into stable application errors instead of leaking raw driver messages to the client.

## Security Considerations

- passwords remain hashed before persistence
- tokens remain signed with `AUTH_SECRET`
- tenant scope continues to be enforced both by token claims and header match
- no client request may choose an arbitrary tenant for read or write
- no operational credential should be committed to the repository

For Neon specifically:

- store connection strings only in environment variables
- prefer pooled connection strings in higher-concurrency environments
- use separate Neon branches or databases for development and test when possible

## Business Impact

This phase is foundational for the commercial viability of AtendeAI.

It enables:

- real persistent onboarding
- safe tenant-scoped account access
- a credible base for onboarding paying tenants
- a migration path toward billing, quotas, and production operations

Without this step, the current API cannot support recurring revenue or operational reliability because all tenant data is ephemeral.

## Implementation Sequence

1. add database config, pool, and migration runner
2. create initial SQL migration from the current schema
3. implement repositories for tenants, users, and business profiles
4. refactor `auth-service` to use repositories and registration transactions
5. refactor `business-profile-service` to use repository-backed tenant queries
6. update HTTP bootstrap to wire database-backed services
7. adapt tests to target the database-backed app
8. run migrations and test suite against the target Postgres database

## Acceptance Criteria

This phase is complete when all of the following are true:

- the API no longer depends on in-memory storage for auth and business profile
- the app starts with a valid `DATABASE_URL`
- the initial schema can be created from repository migrations
- registration is atomic
- login and business profile routes behave as before from the client perspective
- tenant isolation remains enforced
- tests pass against a real Postgres database
- the codebase is ready for Neon-backed dev and staging environments
