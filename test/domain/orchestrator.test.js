import test from "node:test";
import assert from "node:assert/strict";

import { processInboundMessage } from "../../src/domain/orchestrator.js";

test("processInboundMessage returns a safe fallback when the tenant subscription is blocked", async () => {
  const result = await processInboundMessage({
    tenant: {
      id: "tenant-1",
      businessName: "Clinica Exemplo",
      vertical: "clinica",
      planCode: "premium",
      subscriptionStatus: "blocked",
      hours: [],
      location: "Rua A, 123",
      paymentMethods: ["pix"],
      faqItems: [],
      catalogItems: [],
      services: [],
    },
    usage: { monthlyConversations: 1 },
    conversation: { id: "conv-1", customerPhone: "+5511999999999" },
    customerMessage: "Quero agendar uma consulta",
    model: async () => {
      throw new Error("Model should not be called for blocked tenants");
    },
  });

  assert.equal(result.status, "blocked");
  assert.match(result.reply, /indisponivel/i);
});

test("processInboundMessage creates a lead when the plan allows it and model output is valid", async () => {
  const result = await processInboundMessage({
    tenant: {
      id: "tenant-2",
      businessName: "Loja Exemplo",
      vertical: "moda-feminina",
      planCode: "pro",
      subscriptionStatus: "active",
      hours: [],
      location: "Rua B, 99",
      paymentMethods: ["pix", "cartao"],
      faqItems: [{ question: "Qual o horario?", answer: "Seg a sex" }],
      catalogItems: [{ name: "Vestido", priceCents: 18990 }],
      services: [],
    },
    usage: { monthlyConversations: 15 },
    conversation: { id: "conv-2", customerPhone: "+5511888888888" },
    customerMessage: "Quero saber mais e deixar meu contato",
    model: async () => ({
      intent: "lead_interest",
      reply: "Posso registrar seu interesse para a loja entrar em contato.",
      requestedAction: "lead_capture",
      entities: {
        customerName: "Maria",
        interestSummary: "Interesse em vestido",
      },
      confidence: 0.94,
      fallbackReason: null,
    }),
  });

  assert.equal(result.status, "accepted");
  assert.equal(result.action.type, "lead_capture");
  assert.equal(result.action.payload.customerName, "Maria");
});

test("processInboundMessage falls back to human handoff when model confidence is too low", async () => {
  const result = await processInboundMessage({
    tenant: {
      id: "tenant-3",
      businessName: "Salao Exemplo",
      vertical: "salao",
      planCode: "premium",
      subscriptionStatus: "active",
      hours: [],
      location: "Rua C, 10",
      paymentMethods: ["pix"],
      faqItems: [],
      catalogItems: [],
      services: [{ name: "Corte feminino" }],
    },
    usage: { monthlyConversations: 2 },
    conversation: { id: "conv-3", customerPhone: "+5511777777777" },
    customerMessage: "Quero marcar para amanha",
    model: async () => ({
      intent: "schedule_request",
      reply: "Talvez eu consiga te ajudar.",
      requestedAction: "pre_appointment",
      entities: {
        requestedService: "Corte feminino",
      },
      confidence: 0.45,
      fallbackReason: "low_confidence",
    }),
  });

  assert.equal(result.status, "handoff");
  assert.match(result.reply, /atendente/i);
});
