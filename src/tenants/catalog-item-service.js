import { randomUUID } from "node:crypto";

export function createCatalogItemService({ catalogItemRepository }) {
  async function listItems(tenantId) {
    const items = await catalogItemRepository.listByTenantId(tenantId);
    return { items };
  }

  async function createItem(tenantId, payload) {
    if (!payload.itemType || !payload.name) {
      throw createHttpError(400, "Item type and name are required.");
    }

    const item = await catalogItemRepository.create(null, {
      id: randomUUID(),
      tenantId,
      itemType: payload.itemType,
      name: payload.name,
      description: payload.description ?? null,
      priceCents: payload.priceCents ?? null,
      isAvailable: payload.isAvailable ?? true,
      metadata: payload.metadata ?? {},
    });

    return item;
  }

  return {
    listItems,
    createItem,
  };
}

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
