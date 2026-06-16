function mapPreAppointment(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    conversationId: row.conversation_id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    requestedService: row.requested_service,
    preferredDate: row.preferred_date?.toISOString?.().slice(0, 10) ?? row.preferred_date,
    preferredTimeWindow: row.preferred_time_window,
    notes: row.notes,
    status: row.status,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
  };
}

export function createPreAppointmentRepository({ pool }) {
  return {
    async upsertByConversation(client, payload) {
      const executor = client ?? pool;
      const { rows } = await executor.query(
        `
          INSERT INTO pre_appointments (
            id,
            tenant_id,
            conversation_id,
            customer_name,
            customer_phone,
            requested_service,
            preferred_date,
            preferred_time_window,
            notes,
            status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (tenant_id, conversation_id)
          DO UPDATE SET
            customer_name = EXCLUDED.customer_name,
            customer_phone = EXCLUDED.customer_phone,
            requested_service = EXCLUDED.requested_service,
            preferred_date = EXCLUDED.preferred_date,
            preferred_time_window = EXCLUDED.preferred_time_window,
            notes = EXCLUDED.notes,
            status = EXCLUDED.status
          RETURNING
            id,
            tenant_id,
            conversation_id,
            customer_name,
            customer_phone,
            requested_service,
            preferred_date,
            preferred_time_window,
            notes,
            status,
            created_at
        `,
        [
          payload.id,
          payload.tenantId,
          payload.conversationId,
          payload.customerName,
          payload.customerPhone,
          payload.requestedService,
          payload.preferredDate,
          payload.preferredTimeWindow,
          payload.notes,
          payload.status ?? "pending_confirmation",
        ],
      );

      return mapPreAppointment(rows[0]);
    },
  };
}
