import { createFileRoute } from "@tanstack/react-router";
import { sb, requireAdmin, json } from "./_resource-helpers";

export const Route = createFileRoute("/api/admin/backup/$id/download")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireAdmin(request);
        if (auth.response) return auth.response;

        const { data: record, error } = await sb
          .from("backup_records")
          .select("*")
          .eq("id", params.id as any)
          .eq("user_id", auth.user.id)
          .maybeSingle();
        if (error) return json({ message: error.message }, { status: 500 });
        if (!record) return json({ message: "Backup not found" }, { status: 404 });

        // Prefer the stored snapshot payload; fall back to a metadata envelope.
        const payload = (record as any).payload ?? {
          backup: {
            id: record.id,
            filename: record.filename,
            createdAt: record.created_at,
            tableCount: record.table_count,
            rowCount: record.row_count,
            note: "No snapshot payload stored for this backup.",
          },
        };
        const body = JSON.stringify(payload, null, 2);
        return new Response(body, {
          headers: {
            "content-type": "application/json",
            "content-disposition": `attachment; filename="${record.filename}"`,
            "content-length": String(new TextEncoder().encode(body).length),
          },
        });
      },
    },
  },
});
