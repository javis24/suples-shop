import readExcelFile from "read-excel-file/node";

import { ApiError } from "@/lib/api";

export type MicrosipPriceRow = {
  sourceRow: number;
  key: string;
  productKey: string;
  productName: string;
  flavor: string | null;
  presentation: string | null;
  sku: string | null;
  name: string;
  category: string;
  unit: string;
  price: number;
  stock: number;
};

export type SkippedExcelRow = {
  sourceRow: number;
  sku: string | null;
  name: string;
  category: string | null;
  price: number | null;
  stock: number | null;
  message: string;
};

export type DuplicateExcelRow = SkippedExcelRow & {
  selectedSourceRow: number;
};

type ParsedRows = {
  sourceProductRows: number;
  candidates: MicrosipPriceRow[];
  skippedRows: SkippedExcelRow[];
};

export type ProductIdentity = {
  productKey: string;
  productName: string;
  flavor: string | null;
  presentation: string | null;
};

type WebExportBaseRow = {
  sourceRow: number;
  key: string;
  sku: string | null;
  name: string;
  category: string;
  unit: string;
  price: number;
  stock: number;
};

const EXCLUDED_BRANDS = ["BETHA", "TRT"] as const;

const EXCLUDED_CATEGORY_WORDS = new Set([
  "BETHA",
  "TRT",
  "HORMONAS",
  "SARMS",
  "PEPTIDOS",
  "ANABOLICOS",
  "FARMACIA",
]);

const EXCLUDED_NAME_WORDS = new Set([
  "HORMONA",
  "HORMONAS",
  "SARM",
  "SARMS",
  "PEPTIDO",
  "PEPTIDOS",
]);

const EXCLUDED_NAME_PHRASES = [
  "OSTARINE",
  "MK2866",
  "ANAVAR",
  "OXANDROLONA",
  "WINSTROL",
  "TEST PROPIONATO",
  "PREGNYL",
  "GONADOTROPINA",
] as const;

const VARIANT_CATEGORIES = new Set([
  "ADEREZOS",
  "BCAA AMINOACIDOS",
  "CARBOHIDRATOS",
  "CARNITINAS",
  "COLAGENO",
  "CREATINAS",
  "GANADORES DE MASA",
  "GLUTAMINAS",
  "GREENS",
  "PRE ENTRENO",
  "PROTEINAS",
  "SHAKERS",
  "SNAKS Y BEBIDAS",
  "SNACKS Y BEBIDAS",
]);

const APPROXIMATE_LB_CATEGORIES = new Set([
  "PROTEINAS",
  "GANADORES DE MASA",
]);

const PRESENTATION_PATTERN =
  /\b(?:\d+(?:[.,]\d+)?\s*)?(?:SERV(?:S)?|LBS?|OZ|GRS?|KG|ML|LT|PACK|SCOOPS?|PORCIONES?|CAPS?|TABS?|TABLETAS?|CT|PIEZAS?)\b/gi;

const FLAVOR_SUFFIXES = [
  "STRAWBERRY KIWI SMASH",
  "CHOCOLATE PEANUT BUTTER",
  "COOKIES AND CREAM",
  "STRAWBERRY LEMONADE",
  "BLUE RASPBERRY",
  "COTTON CANDY",
  "FRUIT PUNCH",
  "GREEN APPLE",
  "ORANGE MANGO",
  "PEANUT BUTTER",
  "PINEAPPLE MANGO",
  "SOUR GUMMY",
  "TROPICAL PUNCH",
  "WATERMELON LIME",
  "JACKED GRAPE",
  "MANIAC MANGO",
  "BIRTHDAY CAKE",
  "CINNAMON ROLL",
  "DOUBLE CHOCOLATE",
  "FRESA KIWI",
  "FRUTOS ROJOS",
  "LEMON LIME",
  "MANGO PINEAPPLE",
  "STRAWBERRY KIWI",
  "VANILLA ICE CREAM",
  "WHITE CHOCOLATE",
  "BLACK CHERRY",
  "BLUE RAZZ",
  "CHERRY LIMEADE",
  "CHOCOLATE",
  "CHOCOLATE MILK",
  "COCONUT",
  "COLA",
  "FRESA",
  "FRUIT LOOPS",
  "GRAPE",
  "LEMONADE",
  "MANGO",
  "MANGONADA",
  "NARANJA",
  "PINA COLADA",
  "PINEAPPLE",
  "STRAWBERRY",
  "TROPICAL",
  "VAINILLA",
  "VANILLA",
  "WATERMELON",
] as const;

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function money(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsed = Number(
    value.replace(/\$/g, "").replace(/,/g, "").replace(/\s/g, ""),
  );

  return Number.isFinite(parsed) ? parsed : null;
}

function stockNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.trunc(value) : null;
  }

  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsed = Number(value.replace(/,/g, "").replace(/\s/g, ""));
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function cleanProductName(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:)])/g, "$1")
    .replace(/[.\s]+$/g, "")
    .trim();
}

function cleanCategoryName(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeProductKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " AND ")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 255);
}

/**
 * Algunas marcas reportan un peso ligeramente diferente según el sabor
 * (por ejemplo 4.67 y 4.8 LBS), aunque comercialmente sea la misma línea.
 * Solamente normalizamos esos rangos para formar la clave del producto
 * padre; la presentación exacta permanece guardada en cada variante.
 */
function normalizeFamilyPresentation(
  productName: string,
  category = "",
): string {
  if (!APPROXIMATE_LB_CATEGORIES.has(normalizeProductKey(category))) {
    return cleanProductName(productName);
  }

  return cleanProductName(
    productName.replace(
      /\b(\d+(?:[.,]\d+)?)\s*LBS?\b/gi,
      (match, rawWeight: string) => {
        const weight = Number(rawWeight.replace(",", "."));

        if (!Number.isFinite(weight)) return match;
        if (weight >= 1.8 && weight <= 2.2) return "2 LBS";
        if (weight >= 4.5 && weight <= 5.2) return "5 LBS";

        return `${weight} LBS`;
      },
    ),
  );
}

function findPresentation(value: string): string | null {
  const matches = Array.from(value.matchAll(PRESENTATION_PATTERN));
  const lastMatch = matches.at(-1)?.[0];
  return lastMatch ? cleanProductName(lastMatch.toUpperCase()) : null;
}

const NORMALIZED_FLAVOR_SUFFIXES = FLAVOR_SUFFIXES.map((flavor) => ({
  flavor,
  key: normalizeProductKey(flavor),
})).sort((first, second) => second.key.length - first.key.length);

export function resolveProductIdentity(
  name: string,
  category = "",
): ProductIdentity {
  const normalizedName = normalizeProductKey(name);

  for (const candidate of NORMALIZED_FLAVOR_SUFFIXES) {
    const suffix = ` ${candidate.key}`;

    if (!normalizedName.endsWith(suffix)) continue;

    const productName = normalizedName
      .slice(0, -suffix.length)
      .replace(/\s+NEW$/i, "")
      .trim();

    if (productName.split(" ").length < 2) continue;

    const familyName = normalizeFamilyPresentation(productName, category);

    return {
      productKey: normalizeProductKey(familyName),
      productName: familyName,
      flavor: candidate.flavor,
      presentation: findPresentation(productName),
    };
  }

  return {
    productKey: normalizedName,
    productName: name,
    flavor: null,
    presentation: findPresentation(name),
  };
}

function deriveVariantCandidate(
  name: string,
  category: string,
): ProductIdentity | null {
  const categoryKey = normalizeProductKey(category);

  if (!VARIANT_CATEGORIES.has(categoryKey)) {
    return null;
  }

  const matches = Array.from(name.matchAll(PRESENTATION_PATTERN));
  const lastMatch = matches.at(-1);

  if (lastMatch?.index !== undefined) {
    const end = lastMatch.index + lastMatch[0].length;
    const exactProductName = cleanProductName(
      name.slice(0, end).replace(/[()[\]]/g, " "),
    );
    const flavor = cleanProductName(
      name
        .slice(end)
        .replace(/^[\s)\]\-–—:]+/, "")
        .replace(/^NEW\s+/i, "")
        .replace(/\*+$/g, ""),
    );

    if (exactProductName.split(" ").length >= 2 && flavor) {
      const productName = normalizeFamilyPresentation(
        exactProductName,
        category,
      );

      return {
        productKey: normalizeProductKey(productName),
        productName,
        flavor,
        presentation: cleanProductName(lastMatch[0].toUpperCase()),
      };
    }
  }

  const knownFlavorIdentity = resolveProductIdentity(name, category);
  return knownFlavorIdentity.flavor ? knownFlavorIdentity : null;
}

export function resolveVariantIdentity(
  name: string,
  category: string,
): ProductIdentity | null {
  return deriveVariantCandidate(name, category);
}

export function buildProductSourceKey(
  sku: string | null,
  name: string,
): string {
  const normalizedSku = sku
    ? sku.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 245)
    : "";

  if (normalizedSku) {
    return `SKU:${normalizedSku}`;
  }

  return `NAME:${normalizeProductKey(name)}`.slice(0, 255);
}

function normalizedWords(value: string): string[] {
  const normalized = normalizeProductKey(value);
  return normalized ? normalized.split(" ") : [];
}

function exclusionReason(name: string, category: string): string | null {
  const normalizedName = normalizeProductKey(name);

  for (const brand of EXCLUDED_BRANDS) {
    if (normalizedName === brand || normalizedName.startsWith(`${brand} `)) {
      return `Producto excluido por la marca ${brand}`;
    }
  }

  const excludedCategoryWord = normalizedWords(category).find((word) =>
    EXCLUDED_CATEGORY_WORDS.has(word),
  );

  if (excludedCategoryWord) {
    return `Producto excluido por la categoría ${category}`;
  }

  const excludedNameWord = normalizedWords(name).find((word) =>
    EXCLUDED_NAME_WORDS.has(word),
  );

  if (excludedNameWord) {
    return `Producto excluido por el término ${excludedNameWord}`;
  }

  const excludedPhrase = EXCLUDED_NAME_PHRASES.find((phrase) =>
    normalizedName.includes(phrase),
  );

  if (excludedPhrase) {
    return `Producto excluido por el término ${excludedPhrase}`;
  }

  return null;
}

function isFooterOrHeader(value: string): boolean {
  return (
    /^total\s+[\d,]+\s+art[ií]culos/i.test(value) ||
    /^art[ií]culo$/i.test(value) ||
    /^suples shop$/i.test(value) ||
    /^lista de precios$/i.test(value) ||
    /^sucursal:/i.test(value)
  );
}

function isWebExport(sourceRows: unknown[][]): boolean {
  let matchingRows = 0;

  for (const row of sourceRows) {
    const hasName = Boolean(cellText(row[1]));
    const hasCategory = Boolean(cellText(row[8]));
    const hasStock = stockNumber(row[10]) !== null;
    const hasPrice = money(row[12]) !== null;

    if (hasName && hasCategory && hasStock && hasPrice) {
      matchingRows += 1;
      if (matchingRows >= 3) return true;
    }
  }

  return sourceRows.length <= 10 && matchingRows >= 1;
}

function parseWebExport(sourceRows: unknown[][]): ParsedRows {
  const baseRows: WebExportBaseRow[] = [];
  const skippedRows: SkippedExcelRow[] = [];
  let sourceProductRows = 0;

  for (let index = 0; index < sourceRows.length; index += 1) {
    const row = sourceRows[index] ?? [];
    const sku = cellText(row[0]).slice(0, 100) || null;
    const name = cleanProductName(cellText(row[1]));
    const category = cleanCategoryName(cellText(row[8])) || "Sin categoría";
    const stock = stockNumber(row[10]);
    const price = money(row[12]);

    if (!name) continue;

    sourceProductRows += 1;

    if (name.length < 3 || name.length > 255) {
      skippedRows.push({
        sourceRow: index + 1,
        sku,
        name,
        category,
        price,
        stock,
        message: "El nombre del producto no es válido",
      });
      continue;
    }

    if (price === null || price <= 0) {
      skippedRows.push({
        sourceRow: index + 1,
        sku,
        name,
        category,
        price,
        stock,
        message: "El producto no tiene un precio válido mayor que cero",
      });
      continue;
    }

    if (stock === null || stock < 0) {
      skippedRows.push({
        sourceRow: index + 1,
        sku,
        name,
        category,
        price,
        stock,
        message: "La existencia del producto no es válida",
      });
      continue;
    }

    const restrictedReason = exclusionReason(name, category);

    if (restrictedReason) {
      skippedRows.push({
        sourceRow: index + 1,
        sku,
        name,
        category,
        price,
        stock,
        message: restrictedReason,
      });
      continue;
    }

    baseRows.push({
      sourceRow: index + 1,
      key: buildProductSourceKey(sku, name),
      sku,
      name,
      category,
      unit: "Pieza",
      price: Math.round(price * 100) / 100,
      stock,
    });
  }

  const identityBySourceRow = new Map<number, ProductIdentity | null>();

  for (const row of baseRows) {
    const identity = deriveVariantCandidate(row.name, row.category);
    identityBySourceRow.set(row.sourceRow, identity);
  }

  const candidates = baseRows.map<MicrosipPriceRow>((row) => {
    const identity = identityBySourceRow.get(row.sourceRow) ?? null;
    // La identidad no depende de que el Excel actual tenga dos sabores.
    // Así, una familia no vuelve a separarse cuando temporalmente queda
    // una sola variante con existencia.
    const useVariantFamily = Boolean(identity);

    return {
      ...row,
      productKey: useVariantFamily
        ? identity!.productKey
        : normalizeProductKey(row.name),
      productName: useVariantFamily ? identity!.productName : row.name,
      flavor: useVariantFamily ? identity!.flavor : null,
      presentation: useVariantFamily ? identity!.presentation : null,
    };
  });

  return {
    sourceProductRows,
    candidates,
    skippedRows,
  };
}

function parseLegacyPriceList(sourceRows: unknown[][]): ParsedRows {
  const headerIndex = sourceRows.findIndex((row) => {
    const articleHeader = cellText(row[0]).toLowerCase();
    const priceHeader = cellText(row[10]).toLowerCase();

    return (
      articleHeader.includes("artículo") &&
      priceHeader.includes("precio de lista")
    );
  });

  if (headerIndex === -1) {
    throw new ApiError(
      422,
      "El Excel no coincide con ExportacionWeb ni contiene las columnas Artículo y Precio de lista",
    );
  }

  const candidates: MicrosipPriceRow[] = [];
  const skippedRows: SkippedExcelRow[] = [];
  let sourceProductRows = 0;

  for (let index = headerIndex + 1; index < sourceRows.length; index += 1) {
    const row = sourceRows[index] ?? [];
    const firstNamePart = cellText(row[0]);
    const price = money(row[10]);

    if (!firstNamePart || price === null) continue;

    sourceProductRows += 1;

    const nameParts = [firstNamePart];

    for (
      let nextIndex = index + 1;
      nextIndex < sourceRows.length;
      nextIndex += 1
    ) {
      const nextRow = sourceRows[nextIndex] ?? [];
      const continuation = cellText(nextRow[0]);
      const nextPrice = money(nextRow[10]);
      const nextUnit = cellText(nextRow[6]);

      if (nextPrice !== null || nextUnit) break;
      if (isFooterOrHeader(continuation)) break;

      if (continuation) {
        nameParts.push(continuation);
      }
    }

    const name = cleanProductName(nameParts.join(" "));
    const unit = cellText(row[6]) || "Pieza";
    const category = "Sin categoría";

    if (name.length < 3 || name.length > 255) {
      skippedRows.push({
        sourceRow: index + 1,
        sku: null,
        name,
        category,
        price,
        stock: 1,
        message: "El nombre del producto no es válido",
      });
      continue;
    }

    if (price <= 0) {
      skippedRows.push({
        sourceRow: index + 1,
        sku: null,
        name,
        category,
        price,
        stock: 1,
        message: "El producto tiene precio cero o negativo",
      });
      continue;
    }

    const restrictedReason = exclusionReason(name, "");

    if (restrictedReason) {
      skippedRows.push({
        sourceRow: index + 1,
        sku: null,
        name,
        category,
        price,
        stock: 1,
        message: restrictedReason,
      });
      continue;
    }

    const identity = resolveProductIdentity(name);

    candidates.push({
      sourceRow: index + 1,
      key: buildProductSourceKey(null, name),
      productKey: identity.productKey,
      productName: identity.productName,
      flavor: identity.flavor,
      presentation: identity.presentation,
      sku: null,
      name,
      category,
      unit,
      price: Math.round(price * 100) / 100,
      stock: 1,
    });
  }

  return {
    sourceProductRows,
    candidates,
    skippedRows,
  };
}

export async function parseMicrosipPriceList(file: File) {
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

  const selectedSheet =
    sheets.find((sheet) => sheet.sheet.trim().toLowerCase() === "report") ??
    sheets[0];

  const sourceRows = selectedSheet.data as unknown[][];
  const format = isWebExport(sourceRows) ? "WEB_EXPORT" : "LEGACY_PRICE_LIST";
  const parsed =
    format === "WEB_EXPORT"
      ? parseWebExport(sourceRows)
      : parseLegacyPriceList(sourceRows);

  if (parsed.sourceProductRows === 0) {
    throw new ApiError(
      422,
      "No se encontraron productos con precio en el Excel",
    );
  }

  const productsByKey = new Map<string, MicrosipPriceRow>();
  const duplicateRows: DuplicateExcelRow[] = [];

  for (const product of parsed.candidates) {
    const duplicateKey = normalizeProductKey(product.name);
    const previous = productsByKey.get(duplicateKey);

    if (previous) {
      const selected = previous.sku && !product.sku ? previous : product;
      const omitted = selected === previous ? product : previous;

      duplicateRows.push({
        sourceRow: omitted.sourceRow,
        sku: omitted.sku,
        name: omitted.name,
        category: omitted.category,
        price: omitted.price,
        stock: omitted.stock,
        selectedSourceRow: selected.sourceRow,
        message:
          previous.price === product.price && previous.stock === product.stock
            ? `Producto repetido; se utilizó la fila ${selected.sourceRow}`
            : `Producto duplicado con precio o existencia diferente; se utilizó la fila ${selected.sourceRow}`,
      });

      productsByKey.set(duplicateKey, selected);
      continue;
    }

    productsByKey.set(duplicateKey, product);
  }

  const products = Array.from(productsByKey.values());

  if (products.length === 0) {
    throw new ApiError(
      422,
      "Todos los productos del archivo fueron omitidos",
    );
  }

  return {
    sheetName: selectedSheet.sheet,
    format,
    sourceRows: sourceRows.length,
    sourceProductRows: parsed.sourceProductRows,
    products,
    skippedRows: parsed.skippedRows,
    duplicateRows,
  };
}
