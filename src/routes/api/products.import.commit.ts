import { createFileRoute } from "@tanstack/react-router";
import { sb, requireUser, json } from "./_resource-helpers";
import { notify } from "./_notify";
import { recordStockMovement, resolveCentralWarehouse } from "./-stock-helpers";
import {
  normalizeForMatch,
  productRowToDbPayload,
  type NormalizedProductRow,
} from "./_import-helpers";

const OVERWRITE_TO_COLUMN: Record<string, string> = {
  name: "name",
  sku: "sku",
  barcode: "barcode",
  category: "category",
  brand: "brand",
  price: "price",
  cost: "cost",
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
        const forceDuplicate = body.forceDuplicate === true;

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

        // Content-based duplicate-run guard: the same normalized row set was
        // already successfully committed - by ANY account in the
        // organization, not just this uploader, since products are a shared
        // catalog and the stock addition would double regardless of who
        // re-imports it. Blocked unless the caller explicitly opts in via
        // forceDuplicate (the Import Portal's "I understand — import
        // anyway" checkbox, gated behind the Import Portal's admin/manager
        // page access) - i.e. an explicit Force Re-import, never a silent
        // bypass.
        if (batch.content_hash && !forceDuplicate) {
          const { data: priorCommit } = await sb
            .from("product_import_batches")
            .select("id,filename,committed_at")
            .eq("content_hash", batch.content_hash)
            .eq("status", "committed")
            .order("committed_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (priorCommit) {
            return json(
              {
                message: "This inventory file has already been imported.",
                duplicateOfBatchId: priorCommit.id,
                duplicateOfFilename: priorCommit.filename,
                duplicateOfCommittedAt: priorCommit.committed_at,
              },
              { status: 409 },
            );
          }
        }

        const { warehouse: centralWarehouse, error: warehouseErr } = await resolveCentralWarehouse(
          user.id,
        );
        if (warehouseErr) return json({ message: warehouseErr }, { status: 400 });
        const warehouseId = centralWarehouse!.uuid_id ?? String(centralWarehouse!.id);

        const importMode = batch.import_mode as "insert" | "update" | "upsert";
        const pendingRows: any[] = Array.isArray(batch.pending_rows) ? batch.pending_rows : [];

        // Category cache for this commit run: normalized name -> category id.
        const { data: existingCategories } = await sb
          .from("product_categories")
          .select("id,name")
          .eq("is_active", true);
        const categoryByName = new Map<string, string>();
        for (const c of existingCategories ?? [])
          categoryByName.set(normalizeForMatch(c.name).toLowerCase(), c.id);
        const categoriesCreated: string[] = [];
        // Category ids this commit actually CREATED (not just matched) -
        // persisted on the batch below so a later rollback knows exactly
        // which categories it's allowed to consider for cleanup, rather than
        // guessing from timing.
        const categoryIdsCreated: string[] = [];

        async function resolveOrCreateCategory(name: string): Promise<string> {
          const key = normalizeForMatch(name).toLowerCase();
          const cached = categoryByName.get(key);
          if (cached) return cached;
          const { data: created, error: createErr } = await sb
            .from("product_categories")
            .insert({ name: normalizeForMatch(name), is_active: true } as any)
            .select("id")
            .single();
          if (createErr) {
            // Lost a race with a concurrent request that created the same
            // category between our lookup and this insert.
            const { data: retry } = await sb
              .from("product_categories")
              .select("id")
              .ilike("name", normalizeForMatch(name))
              .maybeSingle();
            if (retry) {
              categoryByName.set(key, retry.id);
              return retry.id;
            }
            throw new Error(`Could not create category "${name}": ${createErr.message}`);
          }
          categoryByName.set(key, created.id);
          categoriesCreated.push(normalizeForMatch(name));
          categoryIdsCreated.push(created.id);
          return created.id;
        }

        let importedCount = 0;
        let updatedCount = 0;
        let totalStockAdded = 0;
        const snapshot: any[] = [];
        const errors: string[] = [];

        for (const row of pendingRows) {
          if (!selectedSet.has(row.rowNum)) continue;
          const overrides = rowOverrides[String(row.rowNum)] ?? rowOverrides[row.rowNum];
          const data: NormalizedProductRow = { ...row.data, ...(overrides ?? {}) };
          if (!data.name) {
            errors.push(`Row ${row.rowNum}: name is required`);
            continue;
          }
          if (!data.category) {
            errors.push(`Row ${row.rowNum}: category is required`);
            continue;
          }

          let categoryId: string;
          try {
            categoryId = await resolveOrCreateCategory(data.category);
          } catch (e: any) {
            errors.push(`Row ${row.rowNum}: ${e?.message ?? "category resolution failed"}`);
            continue;
          }

          const payload = productRowToDbPayload(data, user.id);
          payload.category_id = categoryId;
          delete payload.stock; // stock is applied exclusively through a stock movement below

          const isUpdate = row.matchedExistingId && importMode !== "insert";
          if (isUpdate) {
            // The matched product may have been created by a different staff
            // member (products are a shared catalog, not per-uploader) --
            // never reassign its creator attribution to whoever happens to
            // run this import. user_id is set on insert only.
            let updatePayload: Record<string, any> = { ...payload };
            delete updatePayload.user_id;
            if (overwriteFields && overwriteFields.length) {
              updatePayload = { category_id: categoryId };
              for (const key of overwriteFields) {
                const col = OVERWRITE_TO_COLUMN[key];
                if (col && col in payload) updatePayload[col] = (payload as any)[col];
              }
            }
            // A blank CSV expiry date must never erase an existing one.
            if (!data.expiryDate) delete updatePayload.expiry_date;

            // Attempt the stock movement BEFORE writing any product fields:
            // if it fails, nothing about this row has been touched yet, so
            // it's safe to skip it entirely rather than leaving the product's
            // other fields overwritten with no stock ever added.
            let movementRecorded = false;
            if (data.stock > 0) {
              const movement = await recordStockMovement({
                userId: user.id,
                productId: row.matchedExistingId,
                warehouseId,
                movementType: "import",
                quantity: data.stock,
                unitCost: data.cost ? parseFloat(data.cost) : null,
                referenceType: "product_import",
                referenceId: String(batch.id),
                reason: `Import: ${batch.filename}`,
                createdBy: user.id,
              });
              if (movement.error) {
                errors.push(`Row ${row.rowNum}: stock movement failed — ${movement.error}`);
                continue;
              }
              movementRecorded = true;
              const { data: currentRow } = await sb
                .from("products")
                .select("stock")
                .eq("id", row.matchedExistingId)
                .single();
              updatePayload.stock = Number(currentRow?.stock ?? 0) + data.stock;
              totalStockAdded += data.stock;
            }

            // Matching against the shared catalog (see preview.ts) means
            // matchedExistingId may belong to another account -- scoping this
            // write to the importer's own user_id would silently fail to
            // update a colleague's product. id is the primary key; that's
            // the only scope this update needs.
            const { data: updated, error } = await sb
              .from("products")
              .update(updatePayload as any)
              .eq("id", row.matchedExistingId)
              .select("id")
              .single();
            if (error) {
              if (movementRecorded) {
                // The ledger is immutable - the movement above already
                // happened and can't be deleted. Cancel its effect with an
                // offsetting reversal instead of leaving it unreflected in
                // products.stock.
                await recordStockMovement({
                  userId: user.id,
                  productId: row.matchedExistingId,
                  warehouseId,
                  movementType: "import_reversal",
                  quantity: -data.stock,
                  referenceType: "product_import",
                  referenceId: String(batch.id),
                  reason: `Reversal: update failed after stock movement was recorded (${error.message}) — ${batch.filename}`,
                  createdBy: user.id,
                });
                totalStockAdded -= data.stock;
              }
              errors.push(`Row ${row.rowNum}: ${error.message}`);
              continue;
            }
            updatedCount += 1;
            snapshot.push({
              action: "update",
              id: updated.id,
              rowNum: row.rowNum,
              prevValues: row.prevValues,
              stockAdded: data.stock,
            });
          } else {
            payload.stock = 0;
            const { data: inserted, error } = await sb
              .from("products")
              .insert(payload as any)
              .select("id")
              .single();
            if (error) {
              errors.push(`Row ${row.rowNum}: ${error.message}`);
              continue;
            }
            if (data.stock > 0) {
              const movement = await recordStockMovement({
                userId: user.id,
                productId: inserted.id,
                warehouseId,
                movementType: "import",
                quantity: data.stock,
                unitCost: data.cost ? parseFloat(data.cost) : null,
                referenceType: "product_import",
                referenceId: String(batch.id),
                reason: `Import: ${batch.filename} (opening stock)`,
                createdBy: user.id,
              });
              if (movement.error) {
                // The product row exists but its opening stock could not be
                // recorded - roll it back rather than leaving an orphaned
                // zero-stock product miscounted as a successful import.
                await sb.from("products").delete().eq("id", inserted.id);
                errors.push(`Row ${row.rowNum}: opening stock movement failed — ${movement.error}`);
                continue;
              }
              await sb
                .from("products")
                .update({ stock: data.stock } as any)
                .eq("id", inserted.id);
              totalStockAdded += data.stock;
            }
            importedCount += 1;
            snapshot.push({
              action: "insert",
              id: inserted.id,
              rowNum: row.rowNum,
              stockAdded: data.stock,
            });
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
            committed_at: new Date().toISOString(),
            categories_created: categoryIdsCreated,
          } as any)
          .eq("id", batch.id);
        if (updErr) return json({ message: updErr.message }, { status: 500 });

        await notify({
          userId: user.id,
          type: "uploaded-file",
          severity: errors.length ? "warning" : "success",
          title: "Product import committed",
          message: `${batch.filename ?? "file"} — ${importedCount} added, ${updatedCount} updated, ${totalStockAdded} units of stock added${errors.length ? `, ${errors.length} failed` : ""}`,
          link: "/import-portal",
          metadata: {
            batchId: batch.id,
            importedCount,
            updatedCount,
            errorCount: errors.length,
            filename: batch.filename,
            categoriesCreated,
          },
        });

        return json({
          batchId: batch.id,
          importedCount,
          updatedCount,
          totalAffected: importedCount + updatedCount,
          totalStockAdded,
          categoriesCreated,
          errors,
        });
      },
    },
  },
});
