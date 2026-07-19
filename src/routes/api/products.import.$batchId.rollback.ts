import { createFileRoute } from "@tanstack/react-router";
import { sb, requireUser, json } from "./_resource-helpers";
import { notify } from "./_notify";
import { ROLLBACK_WINDOW_HOURS } from "./_import-helpers";

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

        let removed = 0;
        if (insertedIds.length) {
          const { data: del } = await sb
            .from("products")
            .delete()
            .eq("user_id", auth.user.id)
            .in("id", insertedIds)
            .select("id");
          removed = del?.length ?? 0;
        }

        let restored = 0;
        for (const u of updates) {
          const prev = u.prevValues ?? {};
          const restorePayload: Record<string, any> = {};
          for (const [k, col] of Object.entries(PREV_TO_COLUMN)) {
            if (prev[k] !== undefined) restorePayload[col] = prev[k];
          }
          if (prev.price !== undefined && prev.price !== "")
            restorePayload.price = parseFloat(prev.price);
          if (prev.stock !== undefined) restorePayload.stock = Number(prev.stock);
          if (prev.reorderPoint !== undefined)
            restorePayload.reorder_level = Number(prev.reorderPoint);
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
