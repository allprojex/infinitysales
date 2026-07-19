import { createFileRoute } from "@tanstack/react-router";
import { sb, requireAdmin, json } from "./_resource-helpers";

export const Route = createFileRoute("/api/admin/backup/restore-history")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (auth.response) return auth.response;
        const { data, error } = await sb
          .from("restore_history")
          .select("*")
          .eq("user_id", auth.user.id)
          .order("created_at", { ascending: false })
          .limit(100);
        if (error) return json({ message: error.message }, { status: 500 });
        return json(
          (data ?? []).map((r: any) => ({
            id: r.id,
            filename: r.filename,
            tablesRestored: r.tables_restored,
            status: r.status,
            rowsRestored: r.rows_restored,
            notes: r.notes,
            createdAt: r.created_at,
          })),
        );
      },
    },
  },
});
