import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireUser, sb } from "./_helpers";

export const Route = createFileRoute("/api/reports/stock-report")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const url = new URL(request.url);
        const lowStock = url.searchParams.get("lowStock") === "true";
        const { data, error } = await sb.from("products").select("id, name, sku, category, stock, reorder_level, price, warehouse_id, branch_id").eq("is_active", true);
        if (error) return errorJson(500, error.message);
        const items = (data ?? []).map(p => ({
          id: p.id, name: p.name, sku: p.sku, category: p.category,
          stock: Number(p.stock ?? 0), reorderPoint: Number(p.reorder_level ?? 0),
          price: Number(p.price ?? 0),
          warehouseId: p.warehouse_id, branchId: p.branch_id,
          status: Number(p.stock ?? 0) === 0 ? "out" : Number(p.stock ?? 0) <= Number(p.reorder_level ?? 0) ? "low" : "ok",
        }));
        const filtered = lowStock ? items.filter(i => i.status !== "ok") : items;
        return json({ items: filtered, total: filtered.length });
      },
    },
  },
});
