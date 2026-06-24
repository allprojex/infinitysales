import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import {
  MAX_SPREADSHEET_FILE_BYTES,
  parseSpreadsheet,
  validateSpreadsheetUpload,
} from "./_import-helpers";

async function xlsxFile(name = "products.xlsx", type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
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
    const file = new File(["name,sku,stock\nQA Arizona Drink,QA-ARIZONA-TEST,1000\n"], "products.csv", {
      type: "text/csv",
    });

    const parsed = await parseSpreadsheet(file);

    expect(parsed.headers).toEqual(["name", "sku", "stock"]);
    expect(parsed.rows).toEqual([{ name: "QA Arizona Drink", sku: "QA-ARIZONA-TEST", stock: "1000" }]);
    expect(parsed.fileWarnings).toEqual([]);
  });

  it("parses XLSX uploads with ExcelJS and preserves the existing row contract", async () => {
    const parsed = await parseSpreadsheet(await xlsxFile());

    expect(parsed.headers).toEqual(["name", "sku", "stock"]);
    expect(parsed.rows).toEqual([{ name: "QA Arizona Drink", sku: "QA-ARIZONA-TEST", stock: "1000" }]);
    expect(parsed.fileWarnings).toEqual(['Workbook has 2 sheets - only the first ("Products") was read.']);
  });

  it("rejects disallowed MIME types before parsing", () => {
    const file = new File(["name,sku\n"], "products.csv", { type: "application/pdf" });

    expect(validateSpreadsheetUpload(file)).toEqual({ ok: false, message: "CSV file type is not allowed." });
  });

  it("rejects oversized files before parsing", () => {
    const file = new File([new Uint8Array(MAX_SPREADSHEET_FILE_BYTES + 1)], "products.csv", { type: "text/csv" });

    expect(validateSpreadsheetUpload(file)).toEqual({
      ok: false,
      message: "File is too large. Maximum upload size is 10 MB.",
    });
  });

  it("rejects legacy XLS binary files before ExcelJS parsing", async () => {
    const legacyXlsSignature = Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    const file = new File([legacyXlsSignature], "legacy.xls", { type: "application/vnd.ms-excel" });

    await expect(parseSpreadsheet(file)).rejects.toThrow("Legacy .xls binary files are not supported");
  });
});
