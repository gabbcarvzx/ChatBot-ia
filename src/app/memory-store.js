import { randomUUID } from "node:crypto";

export function createMemoryStore() {
  return {
    tenants: new Map(),
    tenantsBySlug: new Map(),
    users: new Map(),
    usersByEmail: new Map(),
    businessProfiles: new Map(),
    nextId() {
      return randomUUID();
    },
  };
}
