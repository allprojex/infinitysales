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
        const categoryId = url.searchParams.get("categoryId");
        let query = sb
          .from("products")
          .select(
            "id, name, sku, category_id, stock, reorder_level, price, warehouse_id, branch_id, product_categories!products_category_id_fkey(name)",
          )
          .eq("is_active", true);
        if (categoryId) query = query.eq("category_id", categoryId);
        const { data, error } = await query;
        if (error) return errorJson(500, error.message);
        const items = (data ?? []).map((p) => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          categoryId: p.category_id,
          category: p.product_categories?.name ?? "Other",
          stock: Number(p.stock ?? 0),
          reorderPoint: Number(p.reorder_level ?? 0),
          price: Number(p.price ?? 0),
          warehouseId: p.warehouse_id,
          branchId: p.branch_id,
          status:
            Number(p.stock ?? 0) === 0
              ? "out"
              : Number(p.stock ?? 0) <= Number(p.reorder_level ?? 0)
                ? "low"
                : "ok",
        }));
        const filtered = lowStock ? items.filter((i) => i.status !== "ok") : items;
        return json({ items: filtered, total: filtered.length });
      },
    },
  },
});
