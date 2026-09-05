import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function ok(data: unknown, meta?: unknown) {
  return json(meta ? { success: true, data, meta } : { success: true, data });
}

export function created(data: unknown) {
  return json({ success: true, data }, { status: 201 });
}

export function noContent() {
  return new NextResponse(null, { status: 204 });
}

export function handleApiError(error: unknown) {
  if (error instanceof ApiError) {
    const setupRequired = error.message === "SETUP_REQUIRED";
    return json(
      {
        success: false,
        error: {
          code: setupRequired
            ? "SETUP_REQUIRED"
            : error.status === 401
              ? "UNAUTHORIZED"
              : error.status === 403
                ? "FORBIDDEN"
                : "REQUEST_ERROR",
          message: setupRequired
            ? "Primero debes crear la cuenta administradora"
            : error.message,
          details: error.details,
        },
      },
      { status: error.status },
    );
  }

  if (error instanceof ZodError) {
    return json(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Los datos enviados no son válidos",
          details: error.issues,
        },
      },
      { status: 422 },
    );
  }

  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : null;

  if (code === "P2002") {
    return json(
      {
        success: false,
        error: { code: "CONFLICT", message: "Ya existe un registro con esos datos" },
      },
      { status: 409 },
    );
  }

  if (code === "P2003") {
    return json(
      {
        success: false,
        error: {
          code: "RELATED_RECORDS",
          message: "El registro está relacionado con otros datos y no puede eliminarse",
        },
      },
      { status: 409 },
    );
  }

  if (code === "P2025") {
    return json(
      {
        success: false,
        error: { code: "NOT_FOUND", message: "El registro solicitado no existe" },
      },
      { status: 404 },
    );
  }

  if (code === "P2028" || code === "P2039") {
  console.error("Database connection error", error);

  return json(
    {
      success: false,
      error: {
        code: "DATABASE_UNAVAILABLE",
        message:
          "La base de datos está ocupada. Intenta nuevamente en unos segundos.",
      },
    },
    { status: 503 },
  );
}

  console.error("API error", error);
  return json(
    {
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Ocurrió un error interno" },
    },
    { status: 500 },
  );
}

export function parseId(value: string) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(400, "El identificador no es válido");
  }
  return id;
}

export function getPagination(searchParams: URLSearchParams) {
  const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
  const limit = Math.min(
    100,
    Math.max(1, Number(searchParams.get("limit") ?? 20) || 20),
  );

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
}

export function paginationMeta(total: number, page: number, limit: number) {
  return {
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}
