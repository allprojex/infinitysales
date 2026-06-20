import { createFileRoute } from "@tanstack/react-router";
import { sb, requireUser, json } from "./_resource-helpers";
import {
  parseSpreadsheet, isCsvFile, isExcelFile, TEMPLATE_VERSION,
  validateProductRow, type NormalizedProductRow,
} from "./_import-helpers";

interface PreviewRow {
  rowNum: number;
  status: "ok" | "warning" | "error";
  errors: string[];
  warnings: string[];
  matchedExistingId: string | null;
  prevValues: any | null;
  data: NormalizedProductRow;
}


export const Route = createFileRoute("/api/products/import/preview")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireUser(request);
        if (auth.response) return auth.response;
        const user = auth.user;

        let importMode: "insert" | "update" | "upsert" = "insert";
        let file: File | null = null;
        try {
          const form = await request.formData();
          const im = String(form.get("importMode") || "insert");
          if (im === "insert" || im === "update" || im === "upsert") importMode = im;
          const f = form.get("file");
          if (f instanceof File) file = f;
          else {
            for (const v of form.getAll("files")) if (v instanceof File) { file = v; break; }
          }
        } catch {
          return json({ message: "Invalid upload" }, { status: 400 });
        }

        if (!file) return json({ message: "No file uploaded" }, { status: 400 });

        const fileWarnings: string[] = [];
        if (!isCsvFile(file.name) && !isExcelFile(file.name)) {
          return json({ message: `Unsupported file type. Please upload a .csv or .xlsx file.` }, { status: 400 });
        }

        let headers: string[] = [];
        let rows: Record<string, string>[] = [];
        try {
          const parsed = await parseSpreadsheet(file);
          headers = parsed.headers;
          rows = parsed.rows;
          fileWarnings.push(...parsed.fileWarnings);
        } catch (e: any) {
          return json({ message: e?.message ?? "Failed to read file" }, { status: 400 });
        }
        if (!headers.length) return json({ message: "The file is empty." }, { status: 400 });

        // Template version warning (header looks for a "name" column)
        const lc = headers.map((h: string) => h.toLowerCase());
        let templateVersionWarning: string | null = null;
        if (!lc.includes("name") && !lc.includes("product_name")) {
          templateVersionWarning = "Header row is missing a 'name' column. Use the downloadable template for the expected column layout.";
        }

        // Pre-load existing SKUs for this user
        const skusInFile = rows.map((r: Record<string, string>) => (r.sku || r.SKU || "").trim()).filter(Boolean);
        const existingBySku = new Map<string, any>();
        if (skusInFile.length) {
          const { data: existing } = await sb.from("products")
            .select("id,name,sku,barcode,category,brand,price,cost,stock,reorder_level,image_url,unit,description,expiry_date,batch_lot_number")
            .eq("user_id", user.id).in("sku", skusInFile);
          for (const p of existing ?? []) if (p.sku) existingBySku.set(p.sku, p);
        }


        // Detect duplicate SKUs within the file
        const skuCounts = new Map<string, number>();
        for (const r of rows as Record<string, string>[]) {
          const s = (r.sku || r.SKU || "").trim();
          if (s) skuCounts.set(s, (skuCounts.get(s) ?? 0) + 1);
        }

        const previewRows: PreviewRow[] = rows.map((raw: Record<string, string>, idx: number) => {

          const v = validateProductRow(raw, idx + 2);
          const sku = v.data.sku;
          const match = sku ? existingBySku.get(sku) ?? null : null;

          if (sku && (skuCounts.get(sku) ?? 0) > 1) {
            v.warnings.push(`SKU "${sku}" appears multiple times in this file`);
          }

          if (importMode === "insert" && match) {
            v.errors.push(`A product with SKU "${sku}" already exists. Switch to update or upsert mode to modify it.`);
          }
          if (importMode === "update" && !match) {
            v.errors.push(`No existing product found for SKU "${sku ?? "(missing)"}" — update mode requires a match. Use upsert mode to insert new rows.`);
          }

          const status: "ok" | "warning" | "error" = v.errors.length ? "error" : v.warnings.length ? "warning" : "ok";
          return {
            rowNum: idx + 2,
            status,
            errors: v.errors,
            warnings: v.warnings,
            matchedExistingId: match?.id ?? null,
            prevValues: match
              ? {
                  name: match.name,
                  sku: match.sku,
                  barcode: match.barcode,
                  category: match.category,
                  brand: match.brand,
                  price: match.price != null ? String(match.price) : null,
                  cost: match.cost != null ? String(match.cost) : null,
                  sellingPrice: null,
                  wholesalePrice: null,
                  stock: Number(match.stock ?? 0),
                  unit: match.unit,
                  description: match.description,
                  reorderPoint: Number(match.reorder_level ?? 0),
                  imageUrl: match.image_url,
                  expiryDate: match.expiry_date ?? null,
                  batchLotNumber: match.batch_lot_number ?? null,
                }
              : null,

            data: v.data,
          };
        });

        const summary = {
          total: previewRows.length,
          ok: previewRows.filter((r) => r.status === "ok").length,
          warnings: previewRows.filter((r) => r.status === "warning").length,
          errors: previewRows.filter((r) => r.status === "error").length,
          updates: previewRows.filter((r) => r.matchedExistingId !== null && r.status !== "error").length,
        };

        // Persist preview batch (status='preview') so commit can load it
        const { data: batch, error } = await sb.from("product_import_batches").insert({
          user_id: user.id,
          filename: file.name,
          import_mode: importMode,
          status: "preview",
          total_rows: previewRows.length,
          imported_count: 0,
          updated_count: 0,
          error_count: summary.errors,
          pending_rows: previewRows as any,
          snapshot: [],
          imported_by_name: user.email ?? user.id,
        } as any).select("id").single();
        if (error) return json({ message: error.message }, { status: 500 });

        return json({
          batchId: batch.id,
          fileName: file.name,
          templateVersion: TEMPLATE_VERSION,
          templateVersionWarning,
          fileWarnings,
          importMode,
          rows: previewRows,
          summary,
        });
      },
    },
  },
});
