// Dry-run validation + mapping preview for sales/purchase bulk imports.
// Returns per-row mapped values, errors, warnings, and an action hint
// so admins can fix rejected rows before committing.

import { createFileRoute } from "@tanstack/react-router";
import { requireAdmin, json } from "./_resource-helpers";
import {
  parseSpreadsheet,
  validateSpreadsheetUpload,
  validatePurchaseRow,
  validateSalesRow,
} from "./_import-helpers";

type SupportedType = "sales" | "purchases";

interface PreviewRow {
  file: string;
  rowNum: number;
  raw: Record<string, string>;
  mapped: Record<string, unknown> | null;
  errors: string[];
  warnings: string[];
  action: "insert" | "skip";
}

interface FilePreview {
  file: string;
  headers: string[];
  unmappedHeaders: string[];
  fileWarnings: string[];
  rowCount: number;
  validCount: number;
  errorCount: number;
  warningCount: number;
  rows: PreviewRow[];
}

interface PreviewResponse {
  type: SupportedType | string;
  supported: boolean;
  totals: { rows: number; valid: number; errors: number; warnings: number; files: number };
  files: FilePreview[];
  message: string;
}

const KNOWN_HEADERS: Record<SupportedType, string[]> = {
  purchases: [
    "order_ref","reference","Order Ref","Reference","PO",
    "supplier","supplier_name","Supplier","Supplier Name",
    "product_name","name","Product","Product Name","item",
    "sku","SKU",
    "quantity","qty","Quantity","Qty",
    "unit_cost","cost","price","Unit Cost","Cost","Price",
    "expected_date","Expected Date","expected","delivery_date",
    "notes","Notes","remarks",
    "status","Status",
  ],
  sales: [
    "order_ref","reference","Order Ref","Reference",
    "customer_name","customer","Customer","Customer Name",
    "customer_email","email","Email","Customer Email",
    "product_name","name","Product","Product Name",
    "quantity","qty","Quantity",
    "unit_price","price","Unit Price","Price",
    "tax","Tax",
    "status","Status",
    "date","Date","sale_date",
    "notes","Notes",
  ],
};

export const Route = createFileRoute("/api/import/$type/preview")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireAdmin(request);
        if (auth.response) return auth.response;

        const type = params.type as SupportedType;
        if (type !== "sales" && type !== "purchases") {
          return json({
            type, supported: false,
            totals: { rows: 0, valid: 0, errors: 0, warnings: 0, files: 0 },
            files: [],
            message: `Preview is only available for "sales" and "purchases".`,
          } satisfies PreviewResponse);
        }

        const files: File[] = [];
        try {
          const form = await request.formData();
          for (const v of form.getAll("files")) if (v instanceof File) files.push(v);
        } catch {
          return json({ message: "Invalid upload" }, { status: 400 });
        }
        if (!files.length) return json({ message: "No files provided" }, { status: 400 });

        const validator = type === "purchases" ? validatePurchaseRow : validateSalesRow;
        const known = new Set(KNOWN_HEADERS[type].map((h) => h.toLowerCase()));
        const filePreviews: FilePreview[] = [];
        let totalRows = 0, totalValid = 0, totalErrors = 0, totalWarnings = 0;

        for (const file of files) {
          const validation = validateSpreadsheetUpload(file);
          if (!validation.ok) {
            filePreviews.push({
              file: file.name, headers: [], unmappedHeaders: [], fileWarnings: [],
              rowCount: 0, validCount: 0, errorCount: 1, warningCount: 0,
              rows: [{
                file: file.name, rowNum: 0, raw: {}, mapped: null,
                errors: [validation.message], warnings: [], action: "skip",
              }],
            });
            totalErrors += 1;
            continue;
          }

          let parsed;
          try { parsed = await parseSpreadsheet(file); }
          catch (e: any) {
            filePreviews.push({
              file: file.name, headers: [], unmappedHeaders: [], fileWarnings: [],
              rowCount: 0, validCount: 0, errorCount: 1, warningCount: 0,
              rows: [{
                file: file.name, rowNum: 0, raw: {}, mapped: null,
                errors: [`Failed to read file: ${e?.message ?? "unknown"}`], warnings: [], action: "skip",
              }],
            });
            totalErrors += 1;
            continue;
          }

          const { headers, rows, fileWarnings } = parsed;
          const unmapped = headers.filter((h) => h && !known.has(h.toLowerCase()));
          const previewRows: PreviewRow[] = [];
          let validCount = 0, errorCount = 0, warningCount = 0;

          rows.forEach((raw, idx) => {
            const rowNum = idx + 2; // +1 for header row, +1 to be 1-indexed
            const res = validator(raw, rowNum);
            const action: "insert" | "skip" = res.errors.length ? "skip" : "insert";
            if (res.errors.length) errorCount += res.errors.length;
            if (res.warnings.length) warningCount += res.warnings.length;
            if (action === "insert") validCount += 1;
            previewRows.push({
              file: file.name, rowNum, raw,
              mapped: res.data as any,
              errors: res.errors, warnings: res.warnings, action,
            });
          });

          totalRows += rows.length;
          totalValid += validCount;
          totalErrors += errorCount;
          totalWarnings += warningCount;

          filePreviews.push({
            file: file.name, headers, unmappedHeaders: unmapped, fileWarnings,
            rowCount: rows.length, validCount, errorCount, warningCount,
            rows: previewRows,
          });
        }

        return json({
          type, supported: true,
          totals: { rows: totalRows, valid: totalValid, errors: totalErrors, warnings: totalWarnings, files: files.length },
          files: filePreviews,
          message: totalValid
            ? `${totalValid} of ${totalRows} row(s) ready to import.`
            : `No rows are ready to import — fix the errors below and re-upload.`,
        } satisfies PreviewResponse);
      },
    },
  },
});
