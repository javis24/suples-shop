import { createHash } from "node:crypto";

export function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 240);
}

export function microsipSku(name: string) {
  const hash = createHash("sha1").update(name.trim().toUpperCase()).digest("hex");
  return `MIC-${hash.slice(0, 12).toUpperCase()}`;
}

export function orderNumber() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `SS-${timestamp}-${random}`;
}
