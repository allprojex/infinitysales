import { createFileRoute } from "@tanstack/react-router";
import { sb, requireUser, json, apiToRow, rowToApi } from "./_resource-helpers";

export const Route = createFileRoute("/api/price-lists/$id/items")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireUser(request);
        if (auth.response) return auth.response;
        const { data, error } = await sb
          .from("price_list_items")
          .select("*")
          .eq("user_id", auth.user.id)
          .eq("price_list_id", params.id);
        if (error) return json({ message: error.message }, { status: 500 });
        return json((data ?? []).map(rowToApi));
      },
      POST: async ({ request, params }) => {
        const auth = await requireUser(request);
        if (auth.response) return auth.response;
        const body = await request.json().catch(() => ({}));
        const row = { ...apiToRow(body), user_id: auth.user.id, price_list_id: params.id };
        const { data, error } = await sb.from("price_list_items").insert(row).select("*").single();
        if (error) return json({ message: error.message }, { status: 500 });
        return json(rowToApi(data));
      },
    },
  },
});
