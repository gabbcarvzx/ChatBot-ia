import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;

export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password, storedHash) {
  const [salt, hash] = storedHash.split(":");

  if (!salt || !hash) {
    return false;
  }

  const derived = scryptSync(password, salt, KEY_LENGTH);
  const original = Buffer.from(hash, "hex");

  if (derived.length !== original.length) {
    return false;
  }

  return timingSafeEqual(derived, original);
}
