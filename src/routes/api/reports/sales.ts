import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireUser, sb, dateRange, loadReportScope } from "./_helpers";
import { rowToApi } from "../_resource-helpers";

export const Route = createFileRoute("/api/reports/sales")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const scope = await loadReportScope(user.id);
        if (scope.error) return errorJson(500, scope.error);
        const { startDate, endDate } = dateRange(request);
        const categoryId = new URL(request.url).searchParams.get("categoryId");
        let q = sb.from("sales").select("*").order("sold_at", { ascending: false });
        if (!scope.isPrivileged) q = q.eq("user_id", user.id);
        if (startDate) q = q.gte("sold_at", startDate);
        if (endDate) q = q.lte("sold_at", endDate + "T23:59:59");
        const { data, error } = await q;
        if (error) return errorJson(500, error.message);
        const productIds = Array.from(
          new Set(
            (data ?? []).flatMap((sale) =>
              Array.isArray(sale.items)
                ? sale.items
                    .map((item) =>
                      String(
                        (item as Record<string, unknown>).productId ??
                          (item as Record<string, unknown>).product_id ??
                          "",
                      ),
                    )
                    .filter(Boolean)
                : [],
            ),
          ),
        );
        const { data: products } = productIds.length
          ? await sb
              .from("products")
              .select("id,category_id,product_categories!products_category_id_fkey(name)")
              .in("id", productIds)
          : { data: [] };
        const productCategories = new Map(
          (products ?? []).map((product) => [
            String(product.id),
            { id: product.category_id, name: product.product_categories?.name ?? "Other" },
          ]),
        );
        const items = (data ?? [])
          .map((sale) => {
            const saleItems = Array.isArray(sale.items)
              ? (sale.items as Record<string, unknown>[])
              : [];
            const categories = Array.from(
              new Set(
                saleItems.map((item) => {
                  const product = productCategories.get(
                    String(item.productId ?? item.product_id ?? ""),
                  );
                  return String(
                    item.categoryName ?? item.category_name ?? product?.name ?? "Other",
                  );
                }),
              ),
            );
            const categoryIds = Array.from(
              new Set(
                saleItems
                  .map(
                    (item) =>
                      productCategories.get(String(item.productId ?? item.product_id ?? ""))?.id,
                  )
                  .filter(Boolean),
              ),
            );
            return { ...rowToApi(sale), categories, categoryIds } as Record<string, unknown>;
          })
          .filter((sale) => !categoryId || (sale.categoryIds as string[]).includes(categoryId));
        const completed = items.filter((r) => r.status === "completed");
        const totalRevenue = completed.reduce((s, r) => s + Number(r.total ?? 0), 0);
        return json({
          items,
          total: items.length,
          totalSales: completed.length,
          totalRevenue,
          scope: scope.scope,
        });
      },
    },
  },
});
