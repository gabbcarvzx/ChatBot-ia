import { buildModelInput, buildSystemPolicy } from "../llm/contract.js";
import { canUseCapability, resolveTenantAccess, validateModelAction } from "./policy.js";

function buildBlockedReply() {
  return "O atendimento automatico esta indisponivel no momento. Um atendente da empresa pode continuar o suporte.";
}

function buildHandoffReply() {
  return "Vou encaminhar seu atendimento para um atendente humano continuar com voce.";
}

function createActionPayload(modelOutput, conversation) {
  if (modelOutput.requestedAction === "lead_capture") {
    return {
      type: "lead_capture",
      payload: {
        conversationId: conversation.id,
        customerName: modelOutput.entities?.customerName ?? null,
        interestSummary: modelOutput.entities?.interestSummary ?? "Lead captured from WhatsApp conversation.",
      },
    };
  }

  if (modelOutput.requestedAction === "pre_appointment") {
    return {
      type: "pre_appointment",
      payload: {
        conversationId: conversation.id,
        customerName: modelOutput.entities?.customerName ?? null,
        requestedService: modelOutput.entities?.requestedService ?? null,
        preferredDate: modelOutput.entities?.preferredDate ?? null,
        preferredTimeWindow: modelOutput.entities?.preferredTimeWindow ?? null,
        notes: modelOutput.entities?.notes ?? null,
      },
    };
  }

  return {
    type: "faq_answer",
    payload: null,
  };
}

export async function processInboundMessage({
  tenant,
  usage,
  conversation,
  customerMessage,
  model,
}) {
  const access = resolveTenantAccess({
    planCode: tenant.planCode,
    subscriptionStatus: tenant.subscriptionStatus,
    usage,
  });

  if (!access.allowed) {
    return {
      status: "blocked",
      reply: buildBlockedReply(),
      reason: access.reason,
    };
  }

  const modelInput = buildModelInput({
    tenant: {
      ...tenant,
      capabilities: [
        "faq_answer",
        canUseCapability(tenant.planCode, "lead_capture") ? "lead_capture" : null,
        canUseCapability(tenant.planCode, "pre_appointment") ? "pre_appointment" : null,
      ].filter(Boolean),
    },
    conversation,
    customerMessage,
  });

  const modelOutput = await model({
    systemPolicy: buildSystemPolicy(),
    input: modelInput,
  });

  const validation = validateModelAction({
    planCode: tenant.planCode,
    modelOutput,
  });

  if (!validation.accepted) {
    return {
      status: "handoff",
      reply: buildHandoffReply(),
      reason: validation.reason,
      rawModelOutput: modelOutput,
    };
  }

  return {
    status: "accepted",
    reply: modelOutput.reply,
    action: createActionPayload(modelOutput, conversation),
    rawModelOutput: modelOutput,
  };
}
