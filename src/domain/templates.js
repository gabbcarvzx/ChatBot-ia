const VERTICAL_TEMPLATES = {
  "moda-feminina": {
    vertical: "moda-feminina",
    requiredFields: ["businessName", "location", "paymentMethods", "catalog"],
    suggestedFaqs: [
      "Quais tamanhos estao disponiveis?",
      "Vocês fazem troca?",
      "Quais formas de pagamento aceitam?",
    ],
  },
  perfumaria: {
    vertical: "perfumaria",
    requiredFields: ["businessName", "location", "paymentMethods", "catalog"],
    suggestedFaqs: [
      "Vocês trabalham com perfumes importados?",
      "Tem kits para presente?",
      "Quais formas de pagamento aceitam?",
    ],
  },
  "material-de-construcao": {
    vertical: "material-de-construcao",
    requiredFields: ["businessName", "location", "paymentMethods", "catalog"],
    suggestedFaqs: [
      "Vocês entregam na minha regiao?",
      "Tem cimento e areia disponiveis?",
      "Aceitam pagamento no Pix?",
    ],
  },
  salao: {
    vertical: "salao",
    requiredFields: ["businessName", "location", "paymentMethods", "services"],
    suggestedFaqs: [
      "Quais servicos voces oferecem?",
      "Qual o horario de atendimento?",
      "Como funciona o agendamento?",
    ],
  },
  clinica: {
    vertical: "clinica",
    requiredFields: ["businessName", "location", "paymentMethods", "services"],
    suggestedFaqs: [
      "Quais especialidades voces atendem?",
      "Quais convenios ou pagamentos aceitam?",
      "Como funciona o pre-agendamento?",
    ],
  },
  restaurante: {
    vertical: "restaurante",
    requiredFields: ["businessName", "location", "paymentMethods", "catalog"],
    suggestedFaqs: [
      "Qual o cardapio de hoje?",
      "Vocês atendem delivery ou retirada?",
      "Qual o horario de funcionamento?",
    ],
  },
};

export function listSupportedVerticals() {
  return Object.keys(VERTICAL_TEMPLATES);
}

export function getVerticalTemplate(vertical) {
  const template = VERTICAL_TEMPLATES[vertical];

  if (!template) {
    throw new Error(`Unsupported vertical: ${vertical}`);
  }

  return structuredClone(template);
}
