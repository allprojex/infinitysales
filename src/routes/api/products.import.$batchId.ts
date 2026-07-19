import { createFileRoute } from "@tanstack/react-router";
import { sb, requireUser, json } from "./_resource-helpers";
import { ROLLBACK_WINDOW_HOURS } from "./_import-helpers";

export const Route = createFileRoute("/api/products/import/$batchId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireUser(request);
        if (auth.response) return auth.response;

        const { data, error } = await sb
          .from("product_import_batches")
          .select("*")
          .eq("user_id", auth.user.id)
          .eq("id", params.batchId)
          .maybeSingle();
        if (error || !data) return json({ message: "Not found" }, { status: 404 });

        const snapshot: any[] = Array.isArray(data.snapshot) ? data.snapshot : [];
        const insertIds = snapshot.filter((s) => s.action === "insert").map((s) => s.id);
        const updateIds = snapshot.filter((s) => s.action === "update").map((s) => s.id);
        const allIds = [...insertIds, ...updateIds];

        let liveProducts: any[] = [];
        if (data.status === "committed" && allIds.length) {
          const { data: prods } = await sb
            .from("products")
            .select("id,name,sku,price,category")
            .eq("user_id", auth.user.id)
            .in("id", allIds);
          liveProducts = (prods ?? []).map((p) => ({
            id: p.id,
            name: p.name,
            sku: p.sku,
            price: String(p.price ?? ""),
            category: p.category,
          }));
        }

        const previewRows = snapshot.map((s) => ({
          name: s.prevValues?.name ?? "",
          sku: s.prevValues?.sku ?? null,
          price: s.prevValues?.price ?? "",
          category: s.prevValues?.category ?? null,
          action: s.action === "insert" ? "inserted" : "updated",
        }));

        const createdAtMs = new Date(data.created_at).getTime();
        const canRollback =
          data.status === "committed" &&
          Date.now() - createdAtMs < ROLLBACK_WINDOW_HOURS * 3600_000;

        return json({
          id: data.id,
          batchId: data.id,
          importedByName: data.imported_by_name ?? "—",
          fileName: data.filename ?? "import.csv",
          rowCount: data.total_rows ?? snapshot.length,
          status: data.status === "rolled_back" ? "rolled_back" : "committed",
          productIds: allIds,
          createdAt: data.created_at,
          updatedAt: data.updated_at ?? data.created_at,
          canRollback,
          rollbackWindowHours: ROLLBACK_WINDOW_HOURS,
          importMode: data.import_mode,
          insertedCount: data.imported_count ?? 0,
          updatedCount: data.updated_count ?? 0,
          overwriteFields: data.overwrite_fields ?? null,
          liveProducts,
          previewRows,
        });
      },
    },
  },
});
