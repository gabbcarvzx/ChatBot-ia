import { createHash, randomUUID } from "node:crypto";

import { processInboundMessage } from "../domain/orchestrator.js";

export function createWhatsAppService({
  pool,
  tenantRepository,
  conversationRepository,
  messageRepository,
  whatsappEventRepository,
  leadRepository,
  preAppointmentRepository,
  whatsappOutboundClient,
  runtimeContextLoader,
  usageLoader,
  model,
  logger,
  verifyToken,
}) {
  return {
    async verifyWebhook({ mode, verifyToken: incomingVerifyToken, challenge }) {
      if (mode !== "subscribe") {
        throw createHttpError(403, "Invalid WhatsApp webhook mode.");
      }

      if (!verifyToken) {
        throw createHttpError(500, "WHATSAPP_CLOUD_API_VERIFY_TOKEN is not configured.");
      }

      if (!incomingVerifyToken || incomingVerifyToken !== verifyToken) {
        throw createHttpError(403, "Invalid WhatsApp verify token.");
      }

      return challenge ?? "";
    },

    async ingestWebhook(payload) {
      const normalized = normalizeWebhookPayload(payload);

      if (!normalized) {
        return {
          accepted: true,
          tenantResolved: false,
          messagePersisted: false,
          ignored: true,
          reason: "unsupported_payload",
        };
      }

      const tenant = await tenantRepository.findByBusinessWhatsApp(normalized.displayPhoneNumber);

      if (!tenant) {
        logger.info("Ignoring WhatsApp webhook for unknown tenant.", {
          displayPhoneNumber: normalized.displayPhoneNumber,
          providerEventId: normalized.providerEventId,
        });

        return {
          accepted: true,
          tenantResolved: false,
          messagePersisted: false,
        };
      }

      const existingEvent = await whatsappEventRepository.findByTenantAndProviderEventId(
        tenant.id,
        normalized.providerEventId,
      );

      if (existingEvent) {
        return {
          accepted: true,
          tenantResolved: true,
          messagePersisted: false,
          duplicate: true,
        };
      }

      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        await whatsappEventRepository.create(client, {
          id: randomUUID(),
          tenantId: tenant.id,
          providerEventId: normalized.providerEventId,
          providerMessageId: normalized.providerMessageId,
          payload,
          status: "received",
          receivedAt: new Date().toISOString(),
          processedAt: null,
        });

        let conversation = await conversationRepository.findByTenantAndCustomerPhone(
          tenant.id,
          normalized.customerPhone,
        );

        if (!conversation) {
          conversation = await conversationRepository.create(client, {
            id: randomUUID(),
            tenantId: tenant.id,
            customerPhone: normalized.customerPhone,
            status: "open",
            startedAt: normalized.occurredAt,
            lastMessageAt: normalized.occurredAt,
          });
        } else {
          conversation = await conversationRepository.touchLastMessageAt(
            client,
            tenant.id,
            conversation.id,
            normalized.occurredAt,
          );
        }

        await messageRepository.create(client, {
          id: randomUUID(),
          tenantId: tenant.id,
          conversationId: conversation.id,
          direction: "inbound",
          providerMessageId: normalized.providerMessageId,
          content: normalized.body,
          createdAt: normalized.occurredAt,
        });

        await whatsappEventRepository.markProcessed(client, tenant.id, normalized.providerEventId);
        await client.query("COMMIT");

        const outboundText = await buildOutboundText({
          tenant,
          conversation,
          customerMessage: normalized.body,
          leadRepository,
          preAppointmentRepository,
          runtimeContextLoader,
          usageLoader,
          model,
          logger,
        });

        await messageRepository.create(null, {
          id: randomUUID(),
          tenantId: tenant.id,
          conversationId: conversation.id,
          direction: "outbound",
          providerMessageId: null,
          content: outboundText,
          createdAt: new Date().toISOString(),
        });

        try {
          await whatsappOutboundClient.sendTextMessage({
            tenantId: tenant.id,
            customerPhone: normalized.customerPhone,
            text: outboundText,
            conversationId: conversation.id,
          });
        } catch (error) {
          logger?.error?.("WhatsApp outbound delivery failed.", {
            tenantId: tenant.id,
            conversationId: conversation.id,
            customerPhone: normalized.customerPhone,
            phoneNumberId: normalized.phoneNumberId,
            errorMessage: error.message,
            providerStatusCode: error.statusCode ?? null,
            providerBody: error.providerBody ?? null,
          });
        }

        return {
          accepted: true,
          tenantResolved: true,
          messagePersisted: true,
          duplicate: false,
        };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

async function buildOutboundText({
  tenant,
  conversation,
  customerMessage,
  leadRepository,
  preAppointmentRepository,
  runtimeContextLoader,
  usageLoader,
  model,
  logger,
}) {
  if (!runtimeContextLoader || !model) {
    return "Mensagem recebida e fila de resposta preparada.";
  }

  const runtimeTenant = await runtimeContextLoader(tenant.id);

  if (!runtimeTenant) {
    logger?.error?.("WhatsApp runtime context was not found for tenant.", {
      tenantId: tenant.id,
      conversationId: conversation.id,
    });

    return buildHandoffReply();
  }

  try {
    const usage = (await usageLoader?.(tenant.id, conversation)) ?? { monthlyConversations: 0 };
    const result = await processInboundMessage({
      tenant: runtimeTenant,
      usage,
      conversation,
      customerMessage,
      model,
    });

    await persistAcceptedAction({
      result,
      tenantId: tenant.id,
      conversation,
      leadRepository,
      preAppointmentRepository,
    });

    return result.reply;
  } catch (error) {
    logger?.error?.("WhatsApp model processing failed.", {
      tenantId: tenant.id,
      conversationId: conversation.id,
      errorMessage: error.message,
    });

    return buildHandoffReply();
  }
}

async function persistAcceptedAction({
  result,
  tenantId,
  conversation,
  leadRepository,
  preAppointmentRepository,
}) {
  if (result.status !== "accepted" || !result.action) {
    return;
  }

  if (result.action.type === "lead_capture" && leadRepository) {
    await leadRepository.upsertByConversation(null, {
      id: randomUUID(),
      tenantId,
      conversationId: conversation.id,
      customerName: result.action.payload.customerName,
      customerPhone: conversation.customerPhone,
      interestSummary: result.action.payload.interestSummary,
      status: "new",
    });
    return;
  }

  if (result.action.type === "pre_appointment" && preAppointmentRepository) {
    await preAppointmentRepository.upsertByConversation(null, {
      id: randomUUID(),
      tenantId,
      conversationId: conversation.id,
      customerName: result.action.payload.customerName,
      customerPhone: conversation.customerPhone,
      requestedService: result.action.payload.requestedService,
      preferredDate: result.action.payload.preferredDate,
      preferredTimeWindow: result.action.payload.preferredTimeWindow,
      notes: result.action.payload.notes,
      status: "pending_confirmation",
    });
  }
}

function buildHandoffReply() {
  return "Vou encaminhar seu atendimento para um atendente humano continuar com voce.";
}

function normalizeWebhookPayload(payload) {
  const messageValue = payload?.entry?.[0]?.changes?.[0]?.value;
  const message = messageValue?.messages?.[0];

  if (
    payload?.object !== "whatsapp_business_account" ||
    !messageValue?.metadata?.display_phone_number ||
    !message?.id ||
    message?.type !== "text" ||
    !message?.text?.body ||
    !message?.from
  ) {
    return null;
  }

  const occurredAt = normalizeOccurredAt(message.timestamp);
  const providerEventId = createProviderEventId({
    entryId: payload.entry?.[0]?.id ?? null,
    phoneNumberId: messageValue.metadata.phone_number_id ?? null,
    providerMessageId: message.id,
  });

  return {
    displayPhoneNumber: normalizePhone(messageValue.metadata.display_phone_number),
    phoneNumberId: messageValue.metadata.phone_number_id ?? null,
    customerPhone: normalizePhone(message.from),
    providerMessageId: message.id,
    providerEventId,
    body: message.text.body.trim(),
    occurredAt,
  };
}

function createProviderEventId({ entryId, phoneNumberId, providerMessageId }) {
  return createHash("sha256")
    .update(JSON.stringify({ entryId, phoneNumberId, providerMessageId }))
    .digest("hex");
}

function normalizeOccurredAt(timestamp) {
  const numericTimestamp = Number(timestamp);

  if (!Number.isFinite(numericTimestamp)) {
    return new Date().toISOString();
  }

  return new Date(numericTimestamp * 1000).toISOString();
}

function normalizePhone(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
