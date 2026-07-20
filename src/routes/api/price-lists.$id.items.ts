import { createFileRoute } from "@tanstack/react-router";
import { sb, requireUser, json, safeJson, rowToApi } from "./_resource-helpers";

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
        const body = await safeJson(request);
        // price_list_items has no "custom_price" column — the frontend's
        // customPrice field is stored in the plain "price" column.
        const row = {
          user_id: auth.user.id,
          price_list_id: params.id,
          product_id: body.productId ?? body.product_id,
          price: Number(body.customPrice ?? body.price ?? 0),
        };
        const { data, error } = await (sb as any)
          .from("price_list_items")
          .insert(row)
          .select("*")
          .single();
        if (error) return json({ message: error.message }, { status: 500 });
        return json(rowToApi(data));
      },
    },
  },
});
