import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireUser, sb } from "./_helpers";

export const Route = createFileRoute("/api/reports/inventory-valuation")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const categoryId = new URL(request.url).searchParams.get("categoryId");
        let query = sb
          .from("products")
          .select(
            "id, name, sku, category_id, stock, cost, price, product_categories!products_category_id_fkey(name)",
          )
          .eq("is_active", true);
        if (categoryId) query = query.eq("category_id", categoryId);
        const { data, error } = await query;
        if (error) return errorJson(500, error.message);
        let totalCost = 0,
          totalRetail = 0;
        const items = (data ?? []).map((p) => {
          const stock = Number(p.stock ?? 0);
          const cost = Number(p.cost ?? 0);
          const price = Number(p.price ?? 0);
          totalCost += stock * cost;
          totalRetail += stock * price;
          return {
            id: p.id,
            name: p.name,
            sku: p.sku,
            categoryId: p.category_id,
            category: p.product_categories?.name ?? "Other",
            stock,
            cost,
            price,
            costValue: stock * cost,
            retailValue: stock * price,
          };
        });
        return json({
          items,
          totalCost,
          totalRetail,
          potentialProfit: totalRetail - totalCost,
          count: items.length,
        });
      },
    },
  },
});
