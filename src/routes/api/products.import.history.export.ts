import { createFileRoute } from "@tanstack/react-router";
import { sb, requireUser, parseQuery } from "./_resource-helpers";

export const Route = createFileRoute("/api/products/import/history/export")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireUser(request);
        if (auth.response) return auth.response;
        const { params } = parseQuery(request);
        const search = (params.get("search") ?? "").trim().toLowerCase();
        const from = params.get("from");
        const to = params.get("to");

        let q = sb.from("product_import_batches").select("*")
          .eq("user_id", auth.user.id)
          .neq("status", "preview")
          .order("created_at", { ascending: false })
          .limit(1000);
        if (from) q = q.gte("created_at", new Date(from).toISOString());
        if (to) { const t = new Date(to); t.setHours(23, 59, 59, 999); q = q.lte("created_at", t.toISOString()); }
        const { data } = await q;
        let rows = data ?? [];
        if (search) {
          rows = rows.filter((r: any) =>
            (r.filename ?? "").toLowerCase().includes(search)
            || (r.imported_by_name ?? "").toLowerCase().includes(search));
        }

        const header = "batch_id,filename,imported_by,import_mode,status,total_rows,imported,updated,errors,created_at";
        const csv = [header, ...rows.map((r: any) =>
          [r.id, r.filename, r.imported_by_name, r.import_mode, r.status, r.total_rows, r.imported_count, r.updated_count, r.error_count, r.created_at]
            .map(v => JSON.stringify(v ?? "")).join(","),
        )].join("\n");
        return new Response(csv, {
          headers: {
            "content-type": "text/csv; charset=utf-8",
            "content-disposition": 'attachment; filename="import-history.csv"',
          },
        });
      },
    },
  },
});
