import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireUser, sb } from "./_helpers";

export const Route = createFileRoute("/api/reports/inventory-valuation")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const { data, error } = await sb.from("products").select("id, name, sku, category, stock, cost, price").eq("is_active", true);
        if (error) return errorJson(500, error.message);
        let totalCost = 0, totalRetail = 0;
        const items = (data ?? []).map(p => {
          const stock = Number(p.stock ?? 0);
          const cost = Number(p.cost ?? 0);
          const price = Number(p.price ?? 0);
          totalCost += stock * cost;
          totalRetail += stock * price;
          return { id: p.id, name: p.name, sku: p.sku, category: p.category, stock, cost, price, costValue: stock * cost, retailValue: stock * price };
        });
        return json({ items, totalCost, totalRetail, potentialProfit: totalRetail - totalCost, count: items.length });
      },
    },
  },
});
