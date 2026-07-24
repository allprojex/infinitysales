import { createFileRoute } from "@tanstack/react-router";
import { sb, requireUser, json } from "./_resource-helpers";
import { notify } from "./_notify";
import { ROLLBACK_WINDOW_HOURS } from "./_import-helpers";
import { recordStockMovement } from "./-stock-helpers";

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

export const Route = createFileRoute("/api/products/import/$batchId/rollback")({
  server: {
    handlers: {
      DELETE: async ({ request, params }) => {
        const auth = await requireUser(request);
        if (auth.response) return auth.response;

        const { data: batch } = await sb
          .from("product_import_batches")
          .select("*")
          .eq("user_id", auth.user.id)
          .eq("id", params.batchId)
          .maybeSingle();
        if (!batch) return json({ message: "Not found" }, { status: 404 });
        if (batch.status !== "committed")
          return json({ message: "Batch is not in a rollback-able state" }, { status: 400 });

        const createdAtMs = new Date(batch.created_at).getTime();
        if (Date.now() - createdAtMs > ROLLBACK_WINDOW_HOURS * 3600_000) {
          return json(
            { message: `Rollback window of ${ROLLBACK_WINDOW_HOURS} hours has expired` },
            { status: 400 },
          );
        }

        const snapshot: any[] = Array.isArray(batch.snapshot) ? batch.snapshot : [];
        const insertedIds = snapshot.filter((s) => s.action === "insert").map((s) => s.id);
        const updates = snapshot.filter((s) => s.action === "update" && s.prevValues);

        // Inserted products are being removed entirely, so their opening-stock
        // movement has to go too (the FK from stock_movements to products has
        // no cascade) - there is no "history" to preserve for a product that
        // is being undone from existing at all.
        let removed = 0;
        if (insertedIds.length) {
          await (sb as any)
            .from("stock_movements")
            .delete()
            .eq("reference_type", "product_import")
            .eq("reference_id", String(batch.id))
            .in("product_id", insertedIds);
          const { data: del } = await sb
            .from("products")
            .delete()
            .eq("user_id", auth.user.id)
            .in("id", insertedIds)
            .select("id");
          removed = del?.length ?? 0;
        }

        // Updated products keep their full ledger: post an offsetting reversal
        // movement rather than deleting the import's movement, and restore
        // every field this import changed (including expiry_date and
        // category_id, which the original rollback never touched).
        let restored = 0;
        for (const u of updates) {
          const prev = u.prevValues ?? {};
          const restorePayload: Record<string, any> = {};
          for (const [k, col] of Object.entries(PREV_TO_COLUMN)) {
            if (prev[k] !== undefined) restorePayload[col] = prev[k];
          }
          if (prev.price !== undefined && prev.price !== "")
            restorePayload.price = parseFloat(prev.price);
          if (prev.cost !== undefined && prev.cost !== "")
            restorePayload.cost = parseFloat(prev.cost);
          if (prev.categoryId !== undefined && prev.categoryId)
            restorePayload.category_id = prev.categoryId;
          if (prev.expiryDate !== undefined) restorePayload.expiry_date = prev.expiryDate;
          if (prev.reorderPoint !== undefined)
            restorePayload.reorder_level = Number(prev.reorderPoint);

          const stockAdded = Number(u.stockAdded ?? 0);
          if (stockAdded > 0) {
            const { data: productRow } = await sb
              .from("products")
              .select("stock, warehouse_id")
              .eq("id", u.id)
              .maybeSingle();
            const movement = await recordStockMovement({
              userId: auth.user.id,
              productId: u.id,
              warehouseId: (productRow as any)?.warehouse_id ?? null,
              movementType: "import_reversal",
              quantity: -stockAdded,
              referenceType: "product_import",
              referenceId: String(batch.id),
              reason: `Rollback of import: ${batch.filename}`,
              createdBy: auth.user.id,
            });
            if (!movement.error) {
              restorePayload.stock = Math.max(
                Number((productRow as any)?.stock ?? 0) - stockAdded,
                0,
              );
            }
          }

          if (Object.keys(restorePayload).length) {
            const { error } = await sb
              .from("products")
              .update(restorePayload as any)
              .eq("user_id", auth.user.id)
              .eq("id", u.id);
            if (!error) restored += 1;
          }
        }

        await sb
          .from("product_import_batches")
          .update({ status: "rolled_back" } as any)
          .eq("id", batch.id);

        await notify({
          userId: auth.user.id,
          type: "uploaded-file",
          severity: "warning",
          title: "Product import rolled back",
          message: `${batch.filename ?? "file"} — ${removed} removed, ${restored} restored`,
          link: "/import-portal",
          metadata: { batchId: batch.id, removed, restored },
        });

        return json({ success: true, removed, restored });
      },
    },
  },
});
