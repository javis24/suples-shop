import { del, put } from "@vercel/blob";

import { ApiError, created, handleApiError, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";

const MAX_IMAGE_SIZE = 4 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

function assertBlobConfigured() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new ApiError(
      503,
      "Falta conectar Vercel Blob y configurar BLOB_READ_WRITE_TOKEN",
    );
  }
}

function safeName(name: string) {
  const extension = name.split(".").pop()?.toLowerCase() || "webp";
  const base = name
    .replace(/\.[^.]+$/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70);

  return `${base || "producto"}.${extension}`;
}

function isManagedBlob(url: string) {
  try {
    const hostname = new URL(url).hostname;
    return (
      hostname === "blob.vercel-storage.com" ||
      hostname.endsWith(".blob.vercel-storage.com")
    );
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  try {
    await requireUser(["ADMIN", "STAFF"]);
    assertBlobConfigured();

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      throw new ApiError(400, "Selecciona una imagen para subir");
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      throw new ApiError(415, "La imagen debe ser JPG, PNG, WEBP o AVIF");
    }
    if (file.size <= 0 || file.size > MAX_IMAGE_SIZE) {
      throw new ApiError(413, "Cada imagen debe pesar como máximo 4 MB");
    }

    const blob = await put(`products/${safeName(file.name)}`, file, {
      access: "public",
      addRandomSuffix: true,
      contentType: file.type,
    });

    return created({
      url: blob.url,
      pathname: blob.pathname,
      contentType: blob.contentType,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    await requireUser(["ADMIN", "STAFF"]);
    assertBlobConfigured();

    const body = (await request.json()) as { url?: unknown };
    const url = typeof body.url === "string" ? body.url.trim() : "";

    if (!url || !isManagedBlob(url)) {
      throw new ApiError(400, "La URL no pertenece al almacenamiento de la tienda");
    }

    await del(url);
    return ok({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
