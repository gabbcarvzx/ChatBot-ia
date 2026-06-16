import { randomUUID } from "node:crypto";

export function createFaqItemService({ faqItemRepository }) {
  async function listItems(tenantId) {
    const items = await faqItemRepository.listByTenantId(tenantId);
    return { items };
  }

  async function createItem(tenantId, payload) {
    if (!payload.question || !payload.answer) {
      throw createHttpError(400, "Question and answer are required.");
    }

    const item = await faqItemRepository.create(null, {
      id: randomUUID(),
      tenantId,
      question: payload.question,
      answer: payload.answer,
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
