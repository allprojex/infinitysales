import { createFileRoute } from "@tanstack/react-router";
import { sb, requireAdmin, parseQuery, json } from "./_resource-helpers";

export const Route = createFileRoute("/api/admin/generated-reports")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (auth.response) return auth.response;
        const { params } = parseQuery(request);
        let q = sb.from("generated_reports").select("*").eq("user_id", auth.user.id);
        const type = params.get("type"); const period = params.get("period");
        if (type && type !== "all") q = q.eq("type", type);
        if (period && period !== "all") q = q.eq("period", period);
        const { data, error } = await q.order("created_at", { ascending: false }).limit(200);
        if (error) return json({ message: error.message }, { status: 500 });
        return json((data ?? []).map((r: any) => ({
          id: r.id, title: r.title, type: r.type, period: r.period,
          status: r.status, fileUrl: r.file_url, notes: r.notes, data: r.data,
          createdAt: r.created_at, updatedAt: r.updated_at,
        })));
      },
    },
  },
});
