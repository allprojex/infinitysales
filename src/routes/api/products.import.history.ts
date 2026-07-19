import { createFileRoute } from "@tanstack/react-router";
import { sb, requireUser, json } from "./_resource-helpers";
import { ROLLBACK_WINDOW_HOURS } from "./_import-helpers";

export const Route = createFileRoute("/api/products/import/history")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireUser(request);
        if (auth.response) return auth.response;
        const { data, error } = await sb
          .from("product_import_batches")
          .select("*")
          .eq("user_id", auth.user.id)
          .neq("status", "preview")
          .order("created_at", { ascending: false })
          .limit(200);
        if (error) return json({ message: error.message }, { status: 500 });

        const now = Date.now();
        const batches = (data ?? []).map((r: any) => {
          const snapshot: any[] = Array.isArray(r.snapshot) ? r.snapshot : [];
          const productIds = snapshot.map((s) => s.id).filter(Boolean);
          const createdAtMs = new Date(r.created_at).getTime();
          return {
            id: r.id,
            batchId: r.id,
            importedByName: r.imported_by_name ?? "—",
            fileName: r.filename ?? "import.csv",
            rowCount: r.total_rows ?? snapshot.length,
            status: r.status === "rolled_back" ? "rolled_back" : "committed",
            productIds,
            createdAt: r.created_at,
            updatedAt: r.updated_at ?? r.created_at,
            canRollback:
              r.status === "committed" && now - createdAtMs < ROLLBACK_WINDOW_HOURS * 3600_000,
            rollbackWindowHours: ROLLBACK_WINDOW_HOURS,
          };
        });
        return json({ batches });
      },
    },
  },
});
