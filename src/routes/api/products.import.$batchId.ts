import { createFileRoute } from "@tanstack/react-router";
import { sb, requireUser, json } from "./_resource-helpers";
import {
  ROLLBACK_WINDOW_HOURS,
  canAccessImportBatch,
  resolveImportBatchScope,
} from "./_import-helpers";

export const Route = createFileRoute("/api/products/import/$batchId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireUser(request);
        if (auth.response) return auth.response;

        // Fetch by id alone, then authorize in code (own vs. admin/manager
        // "all" scope) - identical to how rollback.ts already has to,
        // since a batch this caller doesn't own can still be theirs to
        // view/act on if they're privileged. A 404 (not 403) either way
        // avoids confirming to a regular staff member that a batch ID
        // belongs to someone else.
        const { data, error } = await sb
          .from("product_import_batches")
          .select("*")
          .eq("id", params.batchId)
          .maybeSingle();
        if (error || !data) return json({ message: "Not found" }, { status: 404 });

        const { scope, error: scopeError } = await resolveImportBatchScope(auth.user.id);
        if (scopeError) return json({ message: scopeError }, { status: 500 });
        if (!canAccessImportBatch(scope, data.user_id, auth.user.id)) {
          return json({ message: "Not found" }, { status: 404 });
        }

        const snapshot: any[] = Array.isArray(data.snapshot) ? data.snapshot : [];
        const insertIds = snapshot.filter((s) => s.action === "insert").map((s) => s.id);
        const updateIds = snapshot.filter((s) => s.action === "update").map((s) => s.id);
        const allIds = [...insertIds, ...updateIds];

        // A batch can still have live (un-reversed) products after a partial
        // rollback failure - only a fully "rolled_back" batch has none left.
        const hasLiveProducts =
          data.status === "committed" ||
          data.status === "partially_rolled_back" ||
          data.status === "rollback_failed";
        let liveProducts: any[] = [];
        if (hasLiveProducts && allIds.length) {
          // No user_id filter: products are a shared, organization-wide
          // catalog (see products.ts's GET handler and the
          // "authenticated users can view all products" RLS policy), so a
          // batch that updated a colleague's product must still show that
          // product's live state here regardless of who is viewing it.
          const { data: prods } = await sb
            .from("products")
            .select("id,name,sku,price,category")
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
        // Mirrors the retry rule in products.import.$batchId.rollback.ts: a
        // fresh rollback of a "committed" batch is window-gated, but
        // resuming a "partially_rolled_back" or "rollback_failed" batch is
        // always allowed.
        const canRollback =
          (data.status === "committed" &&
            Date.now() - createdAtMs < ROLLBACK_WINDOW_HOURS * 3600_000) ||
          data.status === "partially_rolled_back" ||
          data.status === "rollback_failed";

        return json({
          id: data.id,
          batchId: data.id,
          importedByName: data.imported_by_name ?? "—",
          fileName: data.filename ?? "import.csv",
          rowCount: data.total_rows ?? snapshot.length,
          status: data.status,
          productIds: allIds,
          createdAt: data.created_at,
          updatedAt: data.updated_at ?? data.created_at,
          canRollback,
          rollbackWindowHours: ROLLBACK_WINDOW_HOURS,
          importMode: data.import_mode,
          insertedCount: data.imported_count ?? 0,
          updatedCount: data.updated_count ?? 0,
          errorCount: data.error_count ?? 0,
          overwriteFields: data.overwrite_fields ?? null,
          liveProducts,
          previewRows,
        });
      },
    },
  },
});
