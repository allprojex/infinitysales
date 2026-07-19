import { createFileRoute } from "@tanstack/react-router";
import { sb, requireUser, json } from "./_resource-helpers";
import { notify } from "./_notify";
import { productRowToDbPayload, type NormalizedProductRow } from "./_import-helpers";

const OVERWRITE_TO_COLUMN: Record<string, string> = {
  name: "name",
  sku: "sku",
  barcode: "barcode",
  category: "category",
  brand: "brand",
  price: "price",
  cost: "cost",
  stock: "stock",
  unit: "unit",
  description: "description",
  reorderPoint: "reorder_level",
  imageUrl: "image_url",
  expiryDate: "expiry_date",
  batchLotNumber: "batch_lot_number",
};

export const Route = createFileRoute("/api/products/import/commit")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireUser(request);
        if (auth.response) return auth.response;
        const user = auth.user;

        const body = await request.json().catch(() => ({}));
        const batchId: string | undefined = body.batchId;
        const selectedRowNums: number[] = Array.isArray(body.selectedRowNums)
          ? body.selectedRowNums
          : [];
        const rowOverrides: Record<string, Record<string, string>> = body.rowOverrides ?? {};
        const overwriteFields: string[] | null = Array.isArray(body.overwriteFields)
          ? body.overwriteFields
          : null;

        if (!batchId) return json({ message: "batchId is required" }, { status: 400 });
        const selectedSet = new Set(selectedRowNums);

        const { data: batch, error: batchErr } = await sb
          .from("product_import_batches")
          .select("*")
          .eq("user_id", user.id)
          .eq("id", batchId)
          .maybeSingle();
        if (batchErr || !batch)
          return json({ message: "Preview batch not found" }, { status: 404 });
        if (batch.status === "committed")
          return json({ message: "Batch already committed" }, { status: 400 });

        const importMode = batch.import_mode as "insert" | "update" | "upsert";
        const pendingRows: any[] = Array.isArray(batch.pending_rows) ? batch.pending_rows : [];

        let importedCount = 0;
        let updatedCount = 0;
        const snapshot: any[] = [];
        const errors: string[] = [];

        for (const row of pendingRows) {
          if (!selectedSet.has(row.rowNum)) continue;
          // Apply overrides
          const overrides = rowOverrides[String(row.rowNum)] ?? rowOverrides[row.rowNum];
          const data: NormalizedProductRow = { ...row.data, ...(overrides ?? {}) };
          if (!data.name) {
            errors.push(`Row ${row.rowNum}: name is required`);
            continue;
          }
          const payload = productRowToDbPayload(data, user.id);

          const isUpdate = row.matchedExistingId && importMode !== "insert";
          if (isUpdate) {
            // Build masked payload
            let updatePayload: Record<string, any> = payload;
            if (overwriteFields && overwriteFields.length) {
              updatePayload = { user_id: user.id };
              for (const key of overwriteFields) {
                const col = OVERWRITE_TO_COLUMN[key];
                if (col && col in payload) updatePayload[col] = (payload as any)[col];
              }
            }
            const { data: updated, error } = await sb
              .from("products")
              .update(updatePayload as any)
              .eq("user_id", user.id)
              .eq("id", row.matchedExistingId)
              .select("id")
              .single();
            if (!error && updated) {
              updatedCount += 1;
              snapshot.push({
                action: "update",
                id: updated.id,
                rowNum: row.rowNum,
                prevValues: row.prevValues,
              });
            } else if (error) {
              errors.push(`Row ${row.rowNum}: ${error.message}`);
            }
          } else {
            const { data: inserted, error } = await sb
              .from("products")
              .insert(payload as any)
              .select("id")
              .single();
            if (!error && inserted) {
              importedCount += 1;
              snapshot.push({ action: "insert", id: inserted.id, rowNum: row.rowNum });
            } else if (error) {
              errors.push(`Row ${row.rowNum}: ${error.message}`);
            }
          }
        }

        const { error: updErr } = await sb
          .from("product_import_batches")
          .update({
            status: "committed",
            imported_count: importedCount,
            updated_count: updatedCount,
            error_count: errors.length,
            snapshot,
            overwrite_fields: overwriteFields,
            pending_rows: null,
          } as any)
          .eq("id", batch.id);
        if (updErr) return json({ message: updErr.message }, { status: 500 });

        await notify({
          userId: user.id,
          type: "uploaded-file",
          severity: errors.length ? "warning" : "success",
          title: "Product import committed",
          message: `${batch.filename ?? "file"} — ${importedCount} added, ${updatedCount} updated${errors.length ? `, ${errors.length} failed` : ""}`,
          link: "/import-portal",
          metadata: {
            batchId: batch.id,
            importedCount,
            updatedCount,
            errorCount: errors.length,
            filename: batch.filename,
          },
        });

        return json({
          batchId: batch.id,
          importedCount,
          updatedCount,
          totalAffected: importedCount + updatedCount,
          errors,
        });
      },
    },
  },
});
