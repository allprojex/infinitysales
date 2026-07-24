import { createFileRoute } from "@tanstack/react-router";
import { sb, requireUser, json } from "./_resource-helpers";
import {
  parseSpreadsheet,
  validateSpreadsheetUpload,
  TEMPLATE_VERSION,
  validateProductRow,
  normalizeForMatch,
  computeImportContentHash,
  expiryStatus,
  type NormalizedProductRow,
} from "./_import-helpers";

interface PreviewRow {
  rowNum: number;
  status: "ok" | "warning" | "error";
  errors: string[];
  warnings: string[];
  matchedExistingId: string | null;
  matchedBy: "sku" | "name" | null;
  prevValues: any | null;
  finalStock: number | null;
  data: NormalizedProductRow;
}

interface CategoryMappingEntry {
  csvCategory: string;
  existingCategoryId: string | null;
  existingCategoryName: string | null;
  willCreate: boolean;
  productCount: number;
}

export const Route = createFileRoute("/api/products/import/preview")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireUser(request);
        if (auth.response) return auth.response;
        const user = auth.user;

        let importMode: "insert" | "update" | "upsert" = "upsert";
        let file: File | null = null;
        try {
          const form = await request.formData();
          const im = String(form.get("importMode") || "upsert");
          if (im === "insert" || im === "update" || im === "upsert") importMode = im;
          const f = form.get("file");
          if (f instanceof File) file = f;
          else {
            for (const v of form.getAll("files"))
              if (v instanceof File) {
                file = v;
                break;
              }
          }
        } catch {
          return json({ message: "Invalid upload" }, { status: 400 });
        }

        if (!file) return json({ message: "No file uploaded" }, { status: 400 });

        const fileWarnings: string[] = [];
        const validation = validateSpreadsheetUpload(file);
        if (!validation.ok) return json({ message: validation.message }, { status: 400 });

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

        const lc = headers.map((h: string) => h.toLowerCase());
        let templateVersionWarning: string | null = null;
        if (!lc.includes("name") && !lc.includes("product_name") && !lc.includes("product name")) {
          templateVersionWarning =
            "Header row is missing a 'name' column. Use the downloadable template for the expected column layout.";
        }

        // Pre-load every existing product for this user - name-matching needs
        // the full catalog, not just rows that happen to carry a SKU.
        const { data: existingProducts, error: existingErr } = await sb
          .from("products")
          .select(
            "id,name,sku,barcode,category,category_id,brand,price,cost,stock,reorder_level,image_url,unit,description,expiry_date,batch_lot_number,product_categories!products_category_id_fkey(name)",
          )
          .eq("user_id", user.id);
        if (existingErr) return json({ message: existingErr.message }, { status: 500 });

        const existingBySku = new Map<string, any>();
        const existingByName = new Map<string, any>();
        for (const p of existingProducts ?? []) {
          if (p.sku) existingBySku.set(p.sku, p);
          if (p.name) existingByName.set(normalizeForMatch(p.name).toLowerCase(), p);
        }

        const { data: existingCategories, error: catErr } = await sb
          .from("product_categories")
          .select("id,name,is_active")
          .eq("is_active", true);
        if (catErr) return json({ message: catErr.message }, { status: 500 });
        const categoryByName = new Map<string, { id: string; name: string }>();
        for (const c of existingCategories ?? [])
          categoryByName.set(normalizeForMatch(c.name).toLowerCase(), { id: c.id, name: c.name });

        // Detect duplicate product names within this file (no SKU to disambiguate).
        const namesSeenInFile = new Set<string>();
        const categoryCounts = new Map<string, { csvCategory: string; count: number }>();

        const previewRows: PreviewRow[] = rows.map((raw: Record<string, string>, idx: number) => {
          const v = validateProductRow(raw, idx + 2);
          if (!v.data.category) v.errors.push("Category is required");
          const sku = v.data.sku;
          const normalizedName = v.data.name ? normalizeForMatch(v.data.name).toLowerCase() : "";

          let match: any = null;
          let matchedBy: "sku" | "name" | null = null;
          if (sku && existingBySku.has(sku)) {
            match = existingBySku.get(sku);
            matchedBy = "sku";
          } else if (normalizedName && existingByName.has(normalizedName)) {
            match = existingByName.get(normalizedName);
            matchedBy = "name";
          }

          if (normalizedName) {
            if (namesSeenInFile.has(normalizedName)) {
              v.errors.push(
                `Product name "${v.data.name}" appears more than once in this file (after trimming/case normalization) — merge or remove the duplicate row before importing.`,
              );
            }
            namesSeenInFile.add(normalizedName);
          }

          if (importMode === "insert" && match) {
            v.errors.push(
              `A product named "${v.data.name}" already exists. Switch to update or upsert mode to modify it.`,
            );
          }
          if (importMode === "update" && !match) {
            v.errors.push(
              `No existing product found named "${v.data.name}" — update mode requires a match.`,
            );
          }

          if (v.data.category) {
            const key = normalizeForMatch(v.data.category).toLowerCase();
            const entry = categoryCounts.get(key) ?? {
              csvCategory: normalizeForMatch(v.data.category),
              count: 0,
            };
            entry.count += 1;
            categoryCounts.set(key, entry);
          }

          const currentStock = match ? Number(match.stock ?? 0) : 0;
          const finalStock = v.errors.length ? null : currentStock + v.data.stock;

          const status: "ok" | "warning" | "error" = v.errors.length
            ? "error"
            : v.warnings.length
              ? "warning"
              : "ok";
          return {
            rowNum: idx + 2,
            status,
            errors: v.errors,
            warnings: v.warnings,
            matchedExistingId: match?.id ? String(match.id) : null,
            matchedBy,
            finalStock,
            prevValues: match
              ? {
                  name: match.name,
                  sku: match.sku,
                  barcode: match.barcode,
                  category: (match.product_categories as any)?.name ?? match.category ?? null,
                  categoryId: match.category_id ?? null,
                  brand: match.brand,
                  price: match.price != null ? String(match.price) : null,
                  cost: match.cost != null ? String(match.cost) : null,
                  stock: currentStock,
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

        const categoryMapping: CategoryMappingEntry[] = Array.from(categoryCounts.entries()).map(
          ([key, entry]) => {
            const existing = categoryByName.get(key);
            return {
              csvCategory: entry.csvCategory,
              existingCategoryId: existing?.id ?? null,
              existingCategoryName: existing?.name ?? null,
              willCreate: !existing,
              productCount: entry.count,
            };
          },
        );

        const validRows = previewRows.filter((r) => r.status !== "error");
        const withExpiry = validRows.filter((r) => r.data.expiryDate);
        const expiredRows = withExpiry.filter((r) => expiryStatus(r.data.expiryDate) === "expired");
        const expiringSoonRows = withExpiry.filter(
          (r) => expiryStatus(r.data.expiryDate) === "expiring_soon",
        );
        const newRows = validRows.filter((r) => !r.matchedExistingId);
        const updateRows = validRows.filter((r) => r.matchedExistingId);
        const totalImportedStock = validRows.reduce((s, r) => s + r.data.stock, 0);
        const purchaseValue = validRows.reduce(
          (s, r) => s + r.data.stock * (r.data.cost ? parseFloat(r.data.cost) : 0),
          0,
        );
        const sellingValue = validRows.reduce(
          (s, r) => s + r.data.stock * (r.data.price ? parseFloat(r.data.price) : 0),
          0,
        );

        const summary = {
          total: previewRows.length,
          ok: previewRows.filter((r) => r.status === "ok").length,
          warnings: previewRows.filter((r) => r.status === "warning").length,
          errors: previewRows.filter((r) => r.status === "error").length,
          newProducts: newRows.length,
          updatedProducts: updateRows.length,
          categoriesMatched: categoryMapping.filter((c) => !c.willCreate).length,
          categoriesToCreate: categoryMapping.filter((c) => c.willCreate).length,
          duplicateProductRows: previewRows.filter((r) =>
            r.errors.some((e) => e.includes("appears more than once")),
          ).length,
          invalidRows: previewRows.filter((r) => r.status === "error").length,
          productsWithExpiry: withExpiry.length,
          productsWithoutExpiry: validRows.length - withExpiry.length,
          expiredProducts: expiredRows.length,
          expiringSoon: expiringSoonRows.length,
          totalImportedStock: Math.round(totalImportedStock * 1000) / 1000,
          purchaseValue: Math.round(purchaseValue * 100) / 100,
          sellingValue: Math.round(sellingValue * 100) / 100,
        };

        const contentHash = await computeImportContentHash(
          validRows.map((r) => ({
            name: r.data.name,
            stock: r.data.stock,
            cost: r.data.cost,
            price: r.data.price,
            expiryDate: r.data.expiryDate,
          })),
        );
        const { data: priorCommit } = await sb
          .from("product_import_batches")
          .select("id,filename,committed_at")
          .eq("user_id", user.id)
          .eq("content_hash", contentHash)
          .eq("status", "committed")
          .order("committed_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const { data: batch, error } = await sb
          .from("product_import_batches")
          .insert({
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
            content_hash: contentHash,
          } as any)
          .select("id")
          .single();
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
          categoryMapping,
          possibleDuplicateOf: priorCommit
            ? {
                batchId: priorCommit.id,
                filename: priorCommit.filename,
                committedAt: priorCommit.committed_at,
              }
            : null,
        });
      },
    },
  },
});
