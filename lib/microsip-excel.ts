import readExcelFile from "read-excel-file/node";
import { ApiError } from "@/lib/api";

export type MicrosipInventoryRow = {
  sourceRow: number;
  category: string;
  name: string;
  unit: string;
  stock: number;
  cost: number;
  inventoryValue: number;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function number(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const parsed = Number(value.replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export async function parseMicrosipInventory(file: File) {
  if (!/\.xlsx$/i.test(file.name)) {
    throw new ApiError(415, "El archivo debe tener extensión .xlsx");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new ApiError(413, "El Excel no puede superar 5 MB");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const sheets = await readExcelFile(buffer);
  if (sheets.length === 0) {
    throw new ApiError(422, "El Excel no contiene hojas");
  }

  const selectedSheet = sheets.find((sheet) => sheet.sheet === "Report") ?? sheets[0];
  const sheetName = selectedSheet.sheet;
  const sourceRows = selectedSheet.data as unknown[][];
  const header = sourceRows[6] ?? [];

  if (
    !text(header[0]).toLowerCase().includes("artículo") ||
    !text(header[7]).toLowerCase().includes("med") ||
    !text(header[11]).toLowerCase().includes("existencia") ||
    !text(header[13]).toLowerCase().includes("costo")
  ) {
    throw new ApiError(
      422,
      "El archivo no tiene el formato de Existencia y valor del inventario de Microsip",
    );
  }

  let currentCategory = "";
  const rows: MicrosipInventoryRow[] = [];

  for (let index = 8; index < sourceRows.length; index += 1) {
    const row = sourceRows[index] ?? [];
    const name = text(row[0]);

    if (name.toUpperCase().startsWith("TIPO:")) {
      currentCategory = name.slice(name.indexOf(":") + 1).trim();
      continue;
    }

    if (
      !name ||
      !currentCategory ||
      /artículos en TIPO:/i.test(name) ||
      /^Total\s+\d+\s+artículos/i.test(name)
    ) {
      continue;
    }

    const unit = text(row[7]);
    const stock = number(row[11]);
    const cost = number(row[13]);
    const inventoryValue = number(row[16]);

    if (!unit || stock === null || cost === null) continue;
    if (!Number.isInteger(stock) || stock < 0 || cost < 0) {
      throw new ApiError(422, `Valores inválidos en la fila ${index + 1}`);
    }

    rows.push({
      sourceRow: index + 1,
      category: currentCategory,
      name,
      unit,
      stock,
      cost,
      inventoryValue: inventoryValue ?? stock * cost,
    });
  }

  if (rows.length === 0) {
    throw new ApiError(422, "No se encontraron productos válidos en el Excel");
  }

  return {
    sheetName,
    sourceRows: sourceRows.length,
    products: rows,
  };
}
