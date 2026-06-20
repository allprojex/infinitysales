import { createFileRoute } from "@tanstack/react-router";
import { sb, requireUser, json, parseQuery, apiToRow, rowToApi } from "./_resource-helpers";

export const Route = createFileRoute("/api/sales-returns")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireUser(request); if (auth.response) return auth.response;
        const { limit, offset } = parseQuery(request);
        const { data, error, count } = await sb.from("sales_returns").select("*", { count: "exact" })
          .eq("user_id", auth.user.id).order("returned_at", { ascending: false }).range(offset, offset + limit - 1);
        if (error) return json({ message: error.message }, { status: 500 });
        return json({ data: (data ?? []).map(rowToApi), total: count ?? 0 });
      },
      POST: async ({ request }) => {
        const auth = await requireUser(request); if (auth.response) return auth.response;
        const body = await request.json().catch(() => ({}));
        const row = { ...apiToRow(body), user_id: auth.user.id };
        const { data, error } = await sb.from("sales_returns").insert(row).select("*").single();
        if (error) return json({ message: error.message }, { status: 500 });
        return json(rowToApi(data));
      },
    },
  },
});
