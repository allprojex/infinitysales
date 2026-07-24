import { createFileRoute } from "@tanstack/react-router";
import { sb, requireUser, json } from "./_resource-helpers";
import { notify } from "./_notify";
import {
  ROLLBACK_WINDOW_HOURS,
  canAccessImportBatch,
  resolveImportBatchScope,
} from "./_import-helpers";
import { recordStockMovement } from "./-stock-helpers";

// Undo Import must never touch stock_movements once it's been written - the
// stock_movements_immutable trigger (prevent_stock_movement_mutation())
// enforces an append-only ledger at the database level, and the FK from
// stock_movements to products then blocks hard-deleting a product with any
// movement history at all. Every quantity change here is therefore posted as
// an offsetting "import_reversal" movement, never a delete/update of an
// existing row, and a rolled-back INSERT is archived (is_active = false),
// never hard-deleted - matching the same "deactivate instead" rule
// products.$id.ts's own DELETE handler already enforces for any product with
// ledger history.

const PREV_TO_COLUMN: Record<string, string> = {
  name: "name",
  sku: "sku",
  barcode: "barcode",
  category: "category",
  brand: "brand",
  unit: "unit",
  description: "description",
  imageUrl: "image_url",
};

type RowOutcome = {
  id: string;
  action: "insert" | "update";
  rowNum: number;
  outcome: "restored" | "reversed_and_archived" | "reversed_manual_review" | "failed";
  detail?: string;
};

/** Tables with a direct product_id column that count as "this product has a
 *  business reference" - if any row matches, the product is not safe to
 *  archive automatically and needs manual review instead. */
const DIRECT_REFERENCE_TABLES = [
  "sale_lines",
  "sale_return_lines",
  "stock_take_items",
  "stock_adjustments",
  "serial_numbers",
  "reorder_rules",
  "price_list_items",
  "esl_devices",
  "purchase_return_items",
] as const;

/** Tables that reference products from inside a jsonb `items` array rather
 *  than a proper FK column (purchase orders, supplier invoices, transfers -
 *  all pre-date any product this import could have created, so the mere
 *  presence of a reference at all is disqualifying). */
const JSON_ITEMS_TABLES = ["product_transfers", "purchase_orders", "supplier_invoices"] as const;

/** Batch-resolve which of the given product ids have ANY business reference
 *  elsewhere in the system (sold, purchased, transferred, stock-taken,
 *  adjusted, serial-tracked, reorder-ruled, price-listed, ESL-tagged, or
 *  edited by a human after creation). One query per table regardless of how
 *  many product ids are being checked, so this scales with batch count, not
 *  batch size x table count. */
async function findReferencedProductIds(productIds: string[]): Promise<Set<string>> {
  const referenced = new Set<string>();
  if (!productIds.length) return referenced;

  for (const table of DIRECT_REFERENCE_TABLES) {
    const { data } = await (sb as any).from(table).select("product_id").in("product_id", productIds);
    for (const row of data ?? []) if (row.product_id) referenced.add(String(row.product_id));
  }

  // jsonb `items` arrays are only ever a handful of rows in this schema
  // today (purchase orders/invoices/transfers), so scanning them in full and
  // filtering in JS is acceptable; if these tables grow large this should
  // move to a proper line-items table or an RPC with a jsonb containment
  // query instead.
  for (const table of JSON_ITEMS_TABLES) {
    const { data } = await (sb as any).from(table).select("items");
    for (const row of data ?? []) {
      const items = Array.isArray(row.items) ? row.items : [];
      for (const item of items) {
        const pid = item?.productId ?? item?.product_id;
        if (pid && productIds.includes(String(pid))) referenced.add(String(pid));
      }
    }
  }

  // Edited after creation: the import commit path never writes audit_logs
  // itself, so any product.update entry for one of these ids can only have
  // come from a human editing it afterward (products.$id.ts's PUT handler).
  const { data: auditRows } = await (sb as any)
    .from("audit_logs")
    .select("entity_id")
    .eq("entity_type", "product")
    .eq("action", "product.update")
    .in("entity_id", productIds);
  for (const row of auditRows ?? []) if (row.entity_id) referenced.add(String(row.entity_id));

  return referenced;
}

async function reverseStockIfAny(params: {
  productId: string;
  stockAdded: number;
  batchId: string;
  filename: string | null;
  userId: string;
}): Promise<{ error: string | null }> {
  const { productId, stockAdded, batchId, filename, userId } = params;
  if (stockAdded <= 0) return { error: null };

  const { data: productRow, error: readErr } = await sb
    .from("products")
    .select("stock, warehouse_id")
    .eq("id", productId)
    .maybeSingle();
  if (readErr) return { error: readErr.message };
  if (!productRow) return { error: "Product not found" };

  const movement = await recordStockMovement({
    userId,
    productId,
    warehouseId: (productRow as any).warehouse_id ?? null,
    movementType: "import_reversal",
    quantity: -stockAdded,
    referenceType: "product_import",
    referenceId: batchId,
    reason: `Rollback of import: ${filename ?? "file"}`,
    createdBy: userId,
  });
  if (movement.error) return { error: movement.error };

  const newStock = Math.max(Number((productRow as any).stock ?? 0) - stockAdded, 0);
  const { error: stockErr } = await sb
    .from("products")
    .update({ stock: newStock } as any)
    .eq("id", productId);
  if (stockErr) return { error: stockErr.message };

  return { error: null };
}

export const Route = createFileRoute("/api/products/import/$batchId/rollback")({
  server: {
    handlers: {
      DELETE: async ({ request, params }) => {
        const auth = await requireUser(request);
        if (auth.response) return auth.response;

        // Cast to any: categories_created/rollback_report/rolled_back_at are
        // new columns (see 20260724220000_import_rollback_redesign.sql) not
        // yet reflected in the generated types.ts - regenerate via
        // `pnpm supabase:types` when Supabase CLI access is available.
        const { data: batch } = (await sb
          .from("product_import_batches")
          .select("*")
          .eq("id", params.batchId)
          .maybeSingle()) as { data: any };
        if (!batch) return json({ message: "Not found" }, { status: 404 });

        // Authorization is ownership/role-based (own batch, or admin/manager
        // "all" scope via resolveImportBatchScope - identical rule to
        // history.ts and $batchId.ts, see _import-helpers.ts); the data
        // changes below are not, because a matched product update can have
        // touched a product created by a different account entirely
        // (products are a shared catalog - see preview.ts/commit.ts). A 404
        // (not 403) for an out-of-scope batch matches $batchId.ts's own
        // convention and avoids confirming the batch id exists at all to a
        // caller who isn't authorized to see it.
        const { scope, error: scopeError } = await resolveImportBatchScope(auth.user.id);
        if (scopeError) return json({ message: scopeError }, { status: 500 });
        if (!canAccessImportBatch(scope, batch.user_id, auth.user.id)) {
          return json({ message: "Not found" }, { status: 404 });
        }

        if (batch.status === "rolled_back") {
          return json(
            {
              message: "This batch has already been fully rolled back.",
              status: "rolled_back",
              report: batch.rollback_report ?? [],
            },
            { status: 409 },
          );
        }
        if (batch.status === "rolling_back") {
          return json({ message: "This batch is already being rolled back." }, { status: 409 });
        }
        if (
          batch.status !== "committed" &&
          batch.status !== "partially_rolled_back" &&
          batch.status !== "rollback_failed"
        ) {
          return json({ message: "Batch is not in a rollback-able state" }, { status: 400 });
        }

        // The rollback window gates STARTING a fresh rollback, not finishing
        // one that's already partially in progress - a retry of a partial
        // rollback must always be allowed regardless of elapsed time, or a
        // slow/interrupted rollback could become permanently unfinishable.
        if (batch.status === "committed") {
          const createdAtMs = new Date(batch.created_at).getTime();
          if (Date.now() - createdAtMs > ROLLBACK_WINDOW_HOURS * 3600_000) {
            return json(
              { message: `Rollback window of ${ROLLBACK_WINDOW_HOURS} hours has expired` },
              { status: 400 },
            );
          }
        }

        // Atomic claim: a single conditional UPDATE is the only thing that
        // can't race with a second concurrent rollback request for the same
        // batch. If zero rows are affected, someone else already claimed it.
        const { data: claimed } = await sb
          .from("product_import_batches")
          .update({ status: "rolling_back" } as any)
          .in("status", ["committed", "partially_rolled_back", "rollback_failed"])
          .eq("id", batch.id)
          .select("id")
          .maybeSingle();
        if (!claimed) {
          return json({ message: "This batch is already being rolled back." }, { status: 409 });
        }

        const priorReport: RowOutcome[] = Array.isArray(batch.rollback_report)
          ? batch.rollback_report
          : [];
        // Idempotency: rows a previous (partial) attempt already completed
        // are never reprocessed, so retrying a partially-rolled-back batch
        // can never post a duplicate reversal movement.
        const alreadyDone = new Set(
          priorReport.filter((r) => r.outcome !== "failed").map((r) => r.id),
        );
        const report: RowOutcome[] = priorReport.filter((r) => alreadyDone.has(r.id));

        try {
          const snapshot: any[] = Array.isArray(batch.snapshot) ? batch.snapshot : [];
          const updateRows = snapshot.filter(
            (s) => s.action === "update" && s.prevValues && !alreadyDone.has(s.id),
          );
          const insertRows = snapshot.filter(
            (s) => s.action === "insert" && !alreadyDone.has(s.id),
          );

          // --- Existing products the import updated: restore fields from
          //     the snapshot, reverse any stock this import added. ---
          for (const u of updateRows) {
            try {
              const prev = u.prevValues ?? {};
              const restorePayload: Record<string, any> = {};
              for (const [k, col] of Object.entries(PREV_TO_COLUMN)) {
                if (prev[k] !== undefined) restorePayload[col] = prev[k];
              }
              if (prev.price !== undefined && prev.price !== "")
                restorePayload.price = parseFloat(prev.price);
              if (prev.cost !== undefined && prev.cost !== "")
                restorePayload.cost = parseFloat(prev.cost);
              if (prev.categoryId) restorePayload.category_id = prev.categoryId;
              if (prev.expiryDate !== undefined) restorePayload.expiry_date = prev.expiryDate;
              if (prev.reorderPoint !== undefined)
                restorePayload.reorder_level = Number(prev.reorderPoint);

              const stockAdded = Number(u.stockAdded ?? 0);
              const reversal = await reverseStockIfAny({
                productId: u.id,
                stockAdded,
                batchId: String(batch.id),
                filename: batch.filename,
                userId: auth.user.id,
              });
              if (reversal.error) throw new Error(`stock reversal failed: ${reversal.error}`);

              if (Object.keys(restorePayload).length) {
                const { error } = await sb
                  .from("products")
                  .update(restorePayload as any)
                  .eq("id", u.id);
                if (error) throw new Error(`field restore failed: ${error.message}`);
              }

              report.push({ id: u.id, action: "update", rowNum: u.rowNum, outcome: "restored" });
            } catch (e: any) {
              report.push({
                id: u.id,
                action: "update",
                rowNum: u.rowNum,
                outcome: "failed",
                detail: e?.message ?? String(e),
              });
            }
          }

          // --- Products the import created: always reverse any stock it
          //     added; archive only if nothing else references the product. ---
          const insertIds = insertRows.map((r) => String(r.id));
          const referenced = await findReferencedProductIds(insertIds);

          for (const ins of insertRows) {
            try {
              const stockAdded = Number(ins.stockAdded ?? 0);
              const reversal = await reverseStockIfAny({
                productId: ins.id,
                stockAdded,
                batchId: String(batch.id),
                filename: batch.filename,
                userId: auth.user.id,
              });
              if (reversal.error) throw new Error(`stock reversal failed: ${reversal.error}`);

              if (referenced.has(String(ins.id))) {
                report.push({
                  id: ins.id,
                  action: "insert",
                  rowNum: ins.rowNum,
                  outcome: "reversed_manual_review",
                  detail:
                    "Product has other business references (a sale, purchase, transfer, stock take, adjustment, serial number, reorder rule, price list, ESL tag, or a manual edit) and was not archived automatically. The opening stock this import added has been reversed. Review manually.",
                });
              } else {
                const { error: archiveErr } = await sb
                  .from("products")
                  .update({ is_active: false } as any)
                  .eq("id", ins.id);
                if (archiveErr) throw new Error(`archive failed: ${archiveErr.message}`);
                report.push({
                  id: ins.id,
                  action: "insert",
                  rowNum: ins.rowNum,
                  outcome: "reversed_and_archived",
                });
              }
            } catch (e: any) {
              report.push({
                id: ins.id,
                action: "insert",
                rowNum: ins.rowNum,
                outcome: "failed",
                detail: e?.message ?? String(e),
              });
            }
          }

          // --- Categories this batch created: archive only if this batch
          //     was the sole creator AND it now has zero active products. ---
          const categoriesArchived: { id: string; name: string | null }[] = [];
          let candidateCategoryIds: string[] = Array.isArray(batch.categories_created)
            ? batch.categories_created.map(String)
            : [];
          const usedCommittedTimeFallback = candidateCategoryIds.length === 0;
          if (usedCommittedTimeFallback) {
            // Pre-migration batches have no persisted categories_created.
            // Fall back to the categories of products this run just
            // archived, guarded by requiring the category to have been
            // created within a tight window of this batch's own commit -
            // otherwise a pre-existing category could be wrongly swept up.
            const justArchivedIds = report
              .filter((r) => r.action === "insert" && r.outcome === "reversed_and_archived")
              .map((r) => r.id);
            if (justArchivedIds.length) {
              const { data: rows } = await sb
                .from("products")
                .select("category_id")
                .in("id", justArchivedIds);
              candidateCategoryIds = Array.from(
                new Set((rows ?? []).map((r: any) => String(r.category_id)).filter(Boolean)),
              );
            }
          }
          for (const catId of candidateCategoryIds) {
            const { data: cat } = await sb
              .from("product_categories")
              .select("id,name,is_active,created_at")
              .eq("id", catId)
              .maybeSingle();
            if (!cat || !cat.is_active) continue;
            if (usedCommittedTimeFallback) {
              const committedAtMs = batch.committed_at
                ? new Date(batch.committed_at).getTime()
                : new Date(batch.created_at).getTime();
              const catCreatedAtMs = new Date(cat.created_at).getTime();
              if (Math.abs(catCreatedAtMs - committedAtMs) > 5 * 60_000) continue;
            }
            const { count } = await sb
              .from("products")
              .select("id", { count: "exact", head: true })
              .eq("category_id", catId)
              .eq("is_active", true);
            if ((count ?? 0) > 0) continue;
            const { error: catArchiveErr } = await sb
              .from("product_categories")
              .update({ is_active: false } as any)
              .eq("id", catId);
            if (!catArchiveErr) categoriesArchived.push({ id: catId, name: cat.name ?? null });
          }

          const restored = report.filter((r) => r.outcome === "restored").length;
          const archived = report.filter((r) => r.outcome === "reversed_and_archived").length;
          const manualReview = report.filter((r) => r.outcome === "reversed_manual_review").length;
          const failed = report.filter((r) => r.outcome === "failed").length;
          const succeeded = restored + archived + manualReview;
          const status: "rolled_back" | "partially_rolled_back" | "rollback_failed" =
            failed === 0 ? "rolled_back" : succeeded > 0 ? "partially_rolled_back" : "rollback_failed";

          const { error: statusErr } = await sb
            .from("product_import_batches")
            .update({
              status,
              rollback_report: report,
              rolled_back_at: new Date().toISOString(),
            } as any)
            .eq("id", batch.id);
          if (statusErr) {
            // The rollback work itself already happened (or partially did) -
            // failing to persist the final status must not be reported as
            // silent success. Surface it distinctly rather than throwing an
            // opaque 500, and leave the batch claimable again for retry.
            await sb
              .from("product_import_batches")
              .update({ status: "partially_rolled_back", rollback_report: report } as any)
              .eq("id", batch.id);
            return json(
              {
                message: `Rollback processing finished but the batch status failed to save: ${statusErr.message}`,
                status: "partially_rolled_back",
                restored,
                archived,
                manualReview,
                failed,
                report,
              },
              { status: 500 },
            );
          }

          await notify({
            userId: auth.user.id,
            type: "uploaded-file",
            severity: status === "rolled_back" ? "warning" : "error",
            title:
              status === "rolled_back"
                ? "Product import rolled back"
                : status === "partially_rolled_back"
                  ? "Product import partially rolled back"
                  : "Product import rollback failed",
            message: `${batch.filename ?? "file"} — ${restored} restored, ${archived} archived, ${manualReview} need manual review, ${failed} failed`,
            link: "/import-portal",
            metadata: { batchId: batch.id, restored, archived, manualReview, failed, status },
          });

          return json(
            {
              status,
              restored,
              archived,
              manualReview,
              failed,
              categoriesArchived,
              report,
            },
            { status: status === "rollback_failed" ? 500 : 200 },
          );
        } catch (e: any) {
          // Anything that escaped the per-row try/catches (e.g. the
          // reference lookup itself failing) still must not be reported as
          // silent success, and must not leave the batch stuck claimed.
          const restored = report.filter((r) => r.outcome === "restored").length;
          const archived = report.filter((r) => r.outcome === "reversed_and_archived").length;
          const manualReview = report.filter((r) => r.outcome === "reversed_manual_review").length;
          const succeeded = restored + archived + manualReview;
          const status = succeeded > 0 ? "partially_rolled_back" : "rollback_failed";
          await sb
            .from("product_import_batches")
            .update({
              status,
              rollback_report: report,
              rolled_back_at: new Date().toISOString(),
            } as any)
            .eq("id", batch.id);
          return json(
            {
              message: `Rollback failed: ${e?.message ?? String(e)}`,
              status,
              restored,
              archived,
              manualReview,
              report,
            },
            { status: 500 },
          );
        }
      },
    },
  },
});
