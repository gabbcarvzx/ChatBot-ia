import { randomUUID } from "node:crypto";

export function createBusinessHoursService({ pool, businessHoursRepository }) {
  async function listHours(tenantId) {
    const hours = await businessHoursRepository.listByTenantId(tenantId);
    return { hours };
  }

  async function replaceHours(tenantId, payload) {
    const hours = normalizeHours(payload.hours ?? []);
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      await businessHoursRepository.replaceForTenant(
        client,
        tenantId,
        hours.map((hour) => ({
          id: randomUUID(),
          ...hour,
        })),
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }

    return listHours(tenantId);
  }

  return {
    listHours,
    replaceHours,
  };
}

function normalizeHours(hours) {
  if (!Array.isArray(hours)) {
    throw createHttpError(400, "Hours payload must be an array.");
  }

  return [...hours]
    .map((hour) => ({
      weekday: hour.weekday,
      opensAt: hour.opensAt ?? null,
      closesAt: hour.closesAt ?? null,
      isClosed: Boolean(hour.isClosed),
    }))
    .sort((left, right) => left.weekday - right.weekday);
}

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
