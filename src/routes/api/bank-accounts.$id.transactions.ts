import { createFileRoute } from "@tanstack/react-router";
import { sb, requireUser, json, parseQuery, apiToRow, rowToApi } from "./_resource-helpers";

export const Route = createFileRoute("/api/bank-accounts/$id/transactions")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireUser(request);
        if (auth.response) return auth.response;
        const { limit, offset } = parseQuery(request);
        const { data, error, count } = await sb
          .from("bank_transactions")
          .select("*", { count: "exact" })
          .eq("user_id", auth.user.id)
          .eq("bank_account_id", params.id)
          .order("occurred_at", { ascending: false })
          .range(offset, offset + limit - 1);
        if (error) return json({ message: error.message }, { status: 500 });
        return json({ data: (data ?? []).map(rowToApi), total: count ?? 0 });
      },
      POST: async ({ request, params }) => {
        const auth = await requireUser(request);
        if (auth.response) return auth.response;
        const body = await request.json().catch(() => ({}));
        const row = { ...apiToRow(body), user_id: auth.user.id, bank_account_id: params.id };
        const { data, error } = await sb.from("bank_transactions").insert(row).select("*").single();
        if (error) return json({ message: error.message }, { status: 500 });
        return json(rowToApi(data));
      },
    },
  },
});
