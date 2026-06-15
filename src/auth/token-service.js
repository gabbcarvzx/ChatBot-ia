import { createHmac } from "node:crypto";

function toBase64Url(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function fromBase64Url(value) {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}

export function createTokenService(secret) {
  function sign(payload) {
    const encodedPayload = toBase64Url(payload);
    const signature = createHmac("sha256", secret).update(encodedPayload).digest("base64url");
    return `${encodedPayload}.${signature}`;
  }

  function verify(token) {
    const [encodedPayload, signature] = token.split(".");

    if (!encodedPayload || !signature) {
      return null;
    }

    const expectedSignature = createHmac("sha256", secret)
      .update(encodedPayload)
      .digest("base64url");

    if (expectedSignature !== signature) {
      return null;
    }

    return fromBase64Url(encodedPayload);
  }

  return { sign, verify };
}
