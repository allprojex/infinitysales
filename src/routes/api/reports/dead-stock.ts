import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireUser, sb, loadReportScope } from "./_helpers";

type Item = { productId?: string; quantity?: number };

export const Route = createFileRoute("/api/reports/dead-stock")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const scope = await loadReportScope(user.id);
        if (scope.error) return errorJson(500, scope.error);
        const url = new URL(request.url);
        const days = parseInt(url.searchParams.get("days") ?? "30", 10) || 30;
        const threshold = Number(url.searchParams.get("threshold") ?? "0");
        const categoryId = url.searchParams.get("categoryId");
        const since = new Date(Date.now() - days * 86400000).toISOString();

        let salesQ = sb
          .from("sales")
          .select("items, sold_at, status")
          .eq("status", "completed")
          .gte("sold_at", since);
        if (!scope.isPrivileged) salesQ = salesQ.eq("user_id", user.id);
        let productsQuery = sb
          .from("products")
          .select(
            "id, name, sku, category_id, stock, price, product_categories!products_category_id_fkey(name)",
          )
          .eq("is_active", true);
        if (categoryId) productsQuery = productsQuery.eq("category_id", categoryId);
        const [{ data: products, error: e1 }, { data: sales, error: e2 }] = await Promise.all([
          productsQuery,
          salesQ,
        ]);
        if (e1 || e2) return errorJson(500, (e1 ?? e2)!.message);
        const soldMap = new Map<string, number>();
        for (const s of sales ?? []) {
          const items: Item[] = Array.isArray(s.items) ? (s.items as Item[]) : [];
          for (const it of items)
            if (it.productId)
              soldMap.set(
                it.productId,
                (soldMap.get(it.productId) ?? 0) + Number(it.quantity ?? 0),
              );
        }
        const items = (products ?? [])
          .map((p) => {
            const sold = soldMap.get(p.id as string) ?? 0;
            return {
              id: p.id,
              name: p.name,
              categoryId: p.category_id,
              category: p.product_categories?.name ?? "Other",
              sku: p.sku,
              stock: Number(p.stock ?? 0),
              price: Number(p.price ?? 0),
              stockValue: Number(p.stock ?? 0) * Number(p.price ?? 0),
              unitsSoldRecent: sold,
            };
          })
          .filter((p) => p.unitsSoldRecent <= threshold && p.stock > 0)
          .sort((a, b) => b.stockValue - a.stockValue);
        return json({ items, total: items.length });
      },
    },
  },
});
