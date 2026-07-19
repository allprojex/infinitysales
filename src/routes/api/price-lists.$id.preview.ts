import { createFileRoute } from "@tanstack/react-router";
import { sb, requireUser, json } from "./_resource-helpers";

export const Route = createFileRoute("/api/price-lists/$id/preview")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireUser(request);
        if (auth.response) return auth.response;
        const { data: items } = await sb
          .from("price_list_items")
          .select("product_id,price")
          .eq("user_id", auth.user.id)
          .eq("price_list_id", params.id);
        const ids = (items ?? []).map((i: any) => i.product_id);
        if (!ids.length) return json([]);
        const { data: products } = await sb
          .from("products")
          .select("id,name,sku,price")
          .in("id", ids);
        const priceMap = new Map((items ?? []).map((i: any) => [i.product_id, Number(i.price)]));
        return json(
          (products ?? []).map((p: any) => ({
            id: p.id,
            name: p.name,
            sku: p.sku,
            standardPrice: p.price,
            listPrice: priceMap.get(p.id) ?? p.price,
          })),
        );
      },
    },
  },
});
