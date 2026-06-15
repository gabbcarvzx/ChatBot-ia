import test from "node:test";
import assert from "node:assert/strict";

import { getVerticalTemplate, listSupportedVerticals } from "../../src/domain/templates.js";

test("all supported launch verticals are available", () => {
  assert.deepEqual(listSupportedVerticals(), [
    "moda-feminina",
    "perfumaria",
    "material-de-construcao",
    "salao",
    "clinica",
    "restaurante",
  ]);
});

test("vertical template exposes onboarding seeds for salons", () => {
  const template = getVerticalTemplate("salao");

  assert.equal(template.vertical, "salao");
  assert.ok(template.suggestedFaqs.length > 0);
  assert.ok(template.requiredFields.includes("businessName"));
  assert.ok(template.requiredFields.includes("services"));
});
