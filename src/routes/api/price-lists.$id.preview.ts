import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, parseQuery, requireUser, rowToApi, sb } from "./_resource-helpers";
import { effectivePrice } from "./-price-list-helpers";

export const Route = createFileRoute("/api/price-lists/$id/preview")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;

        const { data: list, error: listError } = await sb
          .from("price_lists")
          .select("*")
          .eq("user_id", user.id)
          .eq("id", params.id)
          .maybeSingle();
        if (listError) return errorJson(500, listError.message);
        if (!list) return errorJson(404, "Price list not found");
        const listRow = list as Record<string, unknown>;
        const type = String(listRow.type ?? "percentage_discount");
        const discountValue = Number(listRow.discount_value ?? 0);

        const { limit, search } = parseQuery(request);
        let productsQuery = sb
          .from("products")
          .select(
            "id,name,sku,category_id,price,product_categories!products_category_id_fkey(name)",
          )
          .eq("is_active", true)
          .order("name")
          .limit(limit);
        if (search)
          productsQuery = productsQuery.or(`name.ilike.%${search}%,sku.ilike.%${search}%`);
        const { data: products, error: productError } = await productsQuery;
        if (productError) return errorJson(500, productError.message);

        const { data: overrides, error: overrideError } = await (sb as any)
          .from("price_list_items")
          .select("*")
          .eq("user_id", user.id)
          .eq("price_list_id", params.id);
        if (overrideError) return errorJson(500, overrideError.message);
        const overrideByProduct = new Map<string, any>(
          (overrides ?? []).map((o: any) => [String(o.product_id), o]),
        );

        const items = (products ?? []).map((p: any) => {
          const basePrice = Number(p.price ?? 0);
          const override = overrideByProduct.get(String(p.id));
          const effective = override
            ? Number(override.price)
            : effectivePrice(type, discountValue, basePrice);
          const saving = basePrice - effective;
          return {
            id: p.id,
            name: p.name,
            category: p.product_categories?.name ?? null,
            sku: p.sku,
            barcode: null,
            basePrice,
            customPrice: override ? Number(override.price) : null,
            effectivePrice: effective,
            saving,
            discountPct: basePrice > 0 ? (saving / basePrice) * 100 : 0,
            hasOverride: !!override,
            itemId: override ? override.id : null,
          };
        });

        return json({ list: rowToApi(listRow), items, total: items.length });
      },
    },
  },
});
