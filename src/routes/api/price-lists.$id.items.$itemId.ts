import { createFileRoute } from "@tanstack/react-router";
import { sb, requireUser, json, safeJson, rowToApi } from "./_resource-helpers";

async function updateItem(request: Request, userId: string, itemId: string) {
  const body = await safeJson(request);
  const update: Record<string, unknown> = {};
  if (body.customPrice != null || body.price != null) {
    update.price = Number(body.customPrice ?? body.price ?? 0);
  }
  const { data, error } = await (sb as any)
    .from("price_list_items")
    .update(update)
    .eq("user_id", userId)
    .eq("id", itemId)
    .select("*")
    .single();
  if (error) return { data: null, error };
  return { data, error: null };
}

export const Route = createFileRoute("/api/price-lists/$id/items/$itemId")({
  server: {
    handlers: {
      // The frontend calls PUT to update an existing override's price;
      // PATCH is kept for any other caller expecting a partial update.
      PUT: async ({ request, params }) => {
        const auth = await requireUser(request);
        if (auth.response) return auth.response;
        const { data, error } = await updateItem(request, auth.user.id, params.itemId);
        if (error) return json({ message: error.message }, { status: 500 });
        return json(rowToApi(data));
      },
      PATCH: async ({ request, params }) => {
        const auth = await requireUser(request);
        if (auth.response) return auth.response;
        const { data, error } = await updateItem(request, auth.user.id, params.itemId);
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
