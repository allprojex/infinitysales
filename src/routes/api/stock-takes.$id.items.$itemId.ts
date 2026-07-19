import { createFileRoute } from "@tanstack/react-router";
import { sb, requireUser, json, apiToRow, rowToApi } from "./_resource-helpers";

export const Route = createFileRoute("/api/stock-takes/$id/items/$itemId")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const auth = await requireUser(request);
        if (auth.response) return auth.response;
        const body = await request.json().catch(() => ({}));
        const { data, error } = await sb
          .from("stock_take_items")
          .update(apiToRow(body) as any)
          .eq("user_id", auth.user.id)
          .eq("id", params.itemId)
          .select("*")
          .single();
        if (error) return json({ message: error.message }, { status: 500 });
        return json(rowToApi(data));
      },
    },
  },
});
