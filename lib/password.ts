import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

const KEY_LENGTH = 64;

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const [salt, originalHash] = storedHash.split(":");
  if (!salt || !originalHash) return false;

  const calculatedHash = scryptSync(password, salt, KEY_LENGTH);
  const originalBuffer = Buffer.from(originalHash, "hex");

  if (calculatedHash.length !== originalBuffer.length) return false;
  return timingSafeEqual(calculatedHash, originalBuffer);
}
