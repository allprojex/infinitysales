import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import {
  MAX_SPREADSHEET_FILE_BYTES,
  parseSpreadsheet,
  validateSpreadsheetUpload,
  validateProductRow,
  normalizeForMatch,
  computeImportContentHash,
  expiryStatus,
  productRowToDbPayload,
} from "./_import-helpers";

async function xlsxFile(
  name = "products.xlsx",
  type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Products");
  ws.addRow(["name", "sku", "stock"]);
  ws.addRow(["QA Arizona Drink", "QA-ARIZONA-TEST", 1000]);
  wb.addWorksheet("Ignored").addRow(["ignored"]);
  const buffer = await wb.xlsx.writeBuffer();
  return new File([buffer as BlobPart], name, { type });
}

describe("spreadsheet import helpers", () => {
  it("parses CSV uploads without invoking the Excel parser", async () => {
    const file = new File(
      ["name,sku,stock\nQA Arizona Drink,QA-ARIZONA-TEST,1000\n"],
      "products.csv",
      {
        type: "text/csv",
      },
    );

    const parsed = await parseSpreadsheet(file);

    expect(parsed.headers).toEqual(["name", "sku", "stock"]);
    expect(parsed.rows).toEqual([
      { name: "QA Arizona Drink", sku: "QA-ARIZONA-TEST", stock: "1000" },
    ]);
    expect(parsed.fileWarnings).toEqual([]);
  });

  it("parses XLSX uploads with ExcelJS and preserves the existing row contract", async () => {
    const parsed = await parseSpreadsheet(await xlsxFile());

    expect(parsed.headers).toEqual(["name", "sku", "stock"]);
    expect(parsed.rows).toEqual([
      { name: "QA Arizona Drink", sku: "QA-ARIZONA-TEST", stock: "1000" },
    ]);
    expect(parsed.fileWarnings).toEqual([
      'Workbook has 2 sheets - only the first ("Products") was read.',
    ]);
  });

  it("rejects disallowed MIME types before parsing", () => {
    const file = new File(["name,sku\n"], "products.csv", { type: "application/pdf" });

    expect(validateSpreadsheetUpload(file)).toEqual({
      ok: false,
      message: "CSV file type is not allowed.",
    });
  });

  it("rejects oversized files before parsing", () => {
    const file = new File([new Uint8Array(MAX_SPREADSHEET_FILE_BYTES + 1)], "products.csv", {
      type: "text/csv",
    });

    expect(validateSpreadsheetUpload(file)).toEqual({
      ok: false,
      message: "File is too large. Maximum upload size is 10 MB.",
    });
  });

  it("rejects legacy XLS binary files before ExcelJS parsing", async () => {
    const legacyXlsSignature = Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    const file = new File([legacyXlsSignature], "legacy.xls", { type: "application/vnd.ms-excel" });

    await expect(parseSpreadsheet(file)).rejects.toThrow(
      "Legacy .xls binary files are not supported",
    );
  });
});

describe("validateProductRow against the real bulk-import CSV header casing", () => {
  // Exact header row from the live-system product import template:
  // "Product name,Category,Stock,Purchase Price,Selling price,Expire Date"
  // None of these match the field's primary candidate key by exact case —
  // this is a direct regression test for that silent-blank-field failure.
  it("reads every column despite casing that differs from the canonical field names", () => {
    const raw = {
      "Product name": "Nido sachet large",
      Category: "Food products",
      Stock: "7",
      "Purchase Price": "4",
      "Selling price": "6",
      "Expire Date": "04/03/2027",
    };
    const { data, errors, warnings } = validateProductRow(raw, 2);
    expect(errors).toEqual([]);
    expect(data.name).toBe("Nido sachet large");
    expect(data.category).toBe("Food products");
    expect(data.stock).toBe(7);
    expect(data.cost).toBe("4");
    expect(data.price).toBe("6");
    expect(data.expiryDate).toBe("2027-03-04");
    // No SKU column in this template — a "duplicate detection skipped" warning
    // is expected and correct, not a parsing failure.
    expect(warnings).toEqual([
      "No SKU provided — duplicate detection by SKU will be skipped for this row.",
    ]);
  });

  it("treats a blank Expire Date as null, not an error", () => {
    const raw = {
      "Product name": "Dove Shower Gel",
      Category: "Households",
      Stock: "1",
      "Purchase Price": "68",
      "Selling price": "75",
      "Expire Date": "",
    };
    const { data, errors } = validateProductRow(raw, 2);
    expect(errors).toEqual([]);
    expect(data.expiryDate).toBeNull();
  });

  it("parses 2-digit and 4-digit day-first years the same way", () => {
    const base = {
      "Product name": "Vitamilk choco",
      Category: "Soft drink",
      Stock: "62",
      "Purchase Price": "12.5",
      "Selling price": "17",
    };
    expect(validateProductRow({ ...base, "Expire Date": "19/12/26" }, 2).data.expiryDate).toBe(
      "2026-12-19",
    );
    expect(validateProductRow({ ...base, "Expire Date": "19/12/2026" }, 2).data.expiryDate).toBe(
      "2026-12-19",
    );
  });

  it("interprets ambiguous DD/MM dates as day-first, never month-first", () => {
    // 03/04 is ambiguous (both parts <= 12); day-first must win.
    const raw = {
      "Product name": "X",
      Category: "Y",
      Stock: "1",
      "Purchase Price": "1",
      "Selling price": "1",
      "Expire Date": "03/04/2027",
    };
    expect(validateProductRow(raw, 2).data.expiryDate).toBe("2027-04-03");
  });

  it("requires a category and does not silently default it", () => {
    const raw = {
      "Product name": "No Category Product",
      Category: "",
      Stock: "1",
      "Purchase Price": "1",
      "Selling price": "1",
      "Expire Date": "",
    };
    // validateProductRow itself doesn't enforce this (shared with other
    // import types) — the product-import preview/commit endpoints add the
    // check. Confirm the raw category comes through as null so that check
    // has something to act on.
    expect(validateProductRow(raw, 2).data.category).toBeNull();
  });

  it("preserves decimal purchase/selling prices exactly", () => {
    const raw = {
      "Product name": "Decimal Product",
      Category: "Other",
      Stock: "5",
      "Purchase Price": "1.25",
      "Selling price": "112.75",
      "Expire Date": "",
    };
    const { data, errors } = validateProductRow(raw, 2);
    expect(errors).toEqual([]);
    expect(data.cost).toBe("1.25");
    expect(data.price).toBe("112.75");
  });

  it("rejects negative and malformed prices instead of coercing them", () => {
    const raw = {
      "Product name": "Bad Price Product",
      Category: "Other",
      Stock: "1",
      "Purchase Price": "-5",
      "Selling price": "abc",
      "Expire Date": "",
    };
    const { errors } = validateProductRow(raw, 2);
    expect(errors.some((e) => e.includes("Purchase Price"))).toBe(true);
    expect(errors.some((e) => e.includes("Selling Price"))).toBe(true);
  });
});

describe("normalizeForMatch", () => {
  it("trims and collapses repeated whitespace without changing case", () => {
    expect(normalizeForMatch("  Nido   sachet  large  ")).toBe("Nido sachet large");
  });

  it("makes differently-spaced names compare equal, case-insensitively", () => {
    const a = normalizeForMatch("Nido  sachet large").toLowerCase();
    const b = normalizeForMatch(" nido sachet  large ").toLowerCase();
    expect(a).toBe(b);
  });
});

describe("expiryStatus", () => {
  const today = new Date("2026-07-24T00:00:00Z");
  it("classifies null as none", () => {
    expect(expiryStatus(null, today)).toBe("none");
  });
  it("classifies a past date as expired", () => {
    expect(expiryStatus("2026-01-01", today)).toBe("expired");
  });
  it("classifies within 30 days as expiring soon", () => {
    expect(expiryStatus("2026-08-01", today)).toBe("expiring_soon");
  });
  it("classifies far-future dates as ok", () => {
    expect(expiryStatus("2027-01-01", today)).toBe("ok");
  });
});

describe("computeImportContentHash", () => {
  it("is stable regardless of row order", async () => {
    const a = await computeImportContentHash([
      { name: "A", stock: 1, cost: "1", price: "2", expiryDate: null },
      { name: "B", stock: 2, cost: "3", price: "4", expiryDate: "2027-01-01" },
    ]);
    const b = await computeImportContentHash([
      { name: "B", stock: 2, cost: "3", price: "4", expiryDate: "2027-01-01" },
      { name: "A", stock: 1, cost: "1", price: "2", expiryDate: null },
    ]);
    expect(a).toBe(b);
  });

  it("changes when a quantity changes", async () => {
    const a = await computeImportContentHash([
      { name: "A", stock: 1, cost: "1", price: "2", expiryDate: null },
    ]);
    const b = await computeImportContentHash([
      { name: "A", stock: 2, cost: "1", price: "2", expiryDate: null },
    ]);
    expect(a).not.toBe(b);
  });

  it("is case/whitespace-insensitive on name, matching normalizeForMatch", async () => {
    const a = await computeImportContentHash([
      { name: "Nido sachet large", stock: 1, cost: "1", price: "2", expiryDate: null },
    ]);
    const b = await computeImportContentHash([
      { name: "  nido  sachet large ", stock: 1, cost: "1", price: "2", expiryDate: null },
    ]);
    expect(a).toBe(b);
  });
});

describe("productRowToDbPayload", () => {
  it("parses decimal cost/price as numbers, not strings, and stock is provided by the caller separately", () => {
    const payload = productRowToDbPayload(
      {
        name: "Decimal Product",
        sku: null,
        barcode: null,
        category: "Other",
        brand: null,
        price: "112.75",
        cost: "1.25",
        sellingPrice: null,
        wholesalePrice: null,
        stock: 5,
        unit: null,
        description: null,
        reorderPoint: 0,
        imageUrl: null,
        supplier: null,
        taxInfo: null,
        expiryDate: "2027-01-01",
        batchLotNumber: null,
      },
      "user-1",
    );
    expect(payload.price).toBe(112.75);
    expect(payload.cost).toBe(1.25);
    expect(payload.expiry_date).toBe("2027-01-01");
    expect(payload.user_id).toBe("user-1");
  });
});
