import { createFileRoute } from "@tanstack/react-router";
import { sb, requireUser, json, apiToRow, rowToApi } from "./_resource-helpers";

export const Route = createFileRoute("/api/price-lists/$id/items/$itemId")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const auth = await requireUser(request);
        if (auth.response) return auth.response;
        const body = await request.json().catch(() => ({}));
        const { data, error } = await sb
          .from("price_list_items")
          .update(apiToRow(body) as any)
          .eq("user_id", auth.user.id)
          .eq("id", params.itemId)
          .select("*")
          .single();
        if (error) return json({ message: error.message }, { status: 500 });
        return json(rowToApi(data));
      },
      DELETE: async ({ request, params }) => {
        const auth = await requireUser(request);
        if (auth.response) return auth.response;
        const { error } = await sb
          .from("price_list_items")
          .delete()
          .eq("user_id", auth.user.id)
          .eq("id", params.itemId);
        if (error) return json({ message: error.message }, { status: 500 });
        return json({ ok: true });
      },
    },
  },
});
