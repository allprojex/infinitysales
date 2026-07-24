import { createFileRoute } from "@tanstack/react-router";
import { sb, requireUser, json } from "./_resource-helpers";
import { ROLLBACK_WINDOW_HOURS, resolveImportBatchScope } from "./_import-helpers";

export const Route = createFileRoute("/api/products/import/history")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireUser(request);
        if (auth.response) return auth.response;

        const { scope, error: scopeError } = await resolveImportBatchScope(auth.user.id);
        if (scopeError) return json({ message: scopeError }, { status: 500 });

        // "own" (regular staff): only batches they personally uploaded.
        // "all" (admin or manager - see resolveImportBatchScope): every
        // batch, so an admin/manager can find and act on a colleague's
        // import, matching what the rollback endpoint already allows.
        let query = sb
          .from("product_import_batches")
          .select("*")
          .neq("status", "preview")
          .order("created_at", { ascending: false })
          .limit(200);
        if (scope === "own") query = query.eq("user_id", auth.user.id);
        const { data, error } = await query;
        if (error) return json({ message: error.message }, { status: 500 });

        const now = Date.now();
        const batches = (data ?? []).map((r: any) => {
          const snapshot: any[] = Array.isArray(r.snapshot) ? r.snapshot : [];
          const productIds = snapshot.map((s) => s.id).filter(Boolean);
          const createdAtMs = new Date(r.created_at).getTime();
          // A fresh "committed" rollback attempt is gated by the rollback
          // window, but resuming a "partially_rolled_back" or
          // "rollback_failed" batch must stay allowed regardless of elapsed
          // time - see the matching comment in
          // products.import.$batchId.rollback.ts, whose retry logic this
          // must mirror or the "Undoable" badge and this endpoint's status
          // would disagree about which batches can still be acted on.
          const canRollback =
            (r.status === "committed" &&
              now - createdAtMs < ROLLBACK_WINDOW_HOURS * 3600_000) ||
            r.status === "partially_rolled_back" ||
            r.status === "rollback_failed";
          return {
            id: r.id,
            batchId: r.id,
            importedByName: r.imported_by_name ?? "—",
            fileName: r.filename ?? "import.csv",
            rowCount: r.total_rows ?? snapshot.length,
            insertedCount: r.imported_count ?? 0,
            updatedCount: r.updated_count ?? 0,
            errorCount: r.error_count ?? 0,
            status: r.status,
            productIds,
            createdAt: r.created_at,
            updatedAt: r.updated_at ?? r.created_at,
            canRollback,
            rollbackWindowHours: ROLLBACK_WINDOW_HOURS,
          };
        });
        return json({ batches });
      },
    },
  },
});
