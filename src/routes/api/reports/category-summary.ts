import { createFileRoute } from "@tanstack/react-router";
import { dateRange, errorJson, json, loadReportScope, requireUser, sb } from "./_helpers";
import { loadCanonicalSaleLines } from "./-canonical-lines";

type TransactionItem = {
  productId?: unknown;
  product_id?: unknown;
  categoryId?: unknown;
  category_id?: unknown;
  quantity?: unknown;
  unitPrice?: unknown;
  unit_price?: unknown;
  unitCost?: unknown;
  unit_cost?: unknown;
  total?: unknown;
};

export const Route = createFileRoute("/api/reports/category-summary")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const scope = await loadReportScope(user.id);
        if (scope.error) return errorJson(500, scope.error);
        const { startDate, endDate } = dateRange(request);
        const [
          { data: categories, error: categoryError },
          { data: products, error: productError },
        ] = await Promise.all([
          sb.from("product_categories").select("id,name,is_active").order("name"),
          sb.from("products").select("id,category_id,stock,cost,price"),
        ]);
        if (categoryError || productError)
          return errorJson(
            500,
            (categoryError ?? productError)?.message ?? "Could not load categories",
          );
        let salesQuery = sb.from("sales").select("id,status,sold_at").eq("status", "completed");
        let purchaseQuery = sb.from("purchase_orders").select("items,status,ordered_at");
        if (!scope.isPrivileged) {
          salesQuery = salesQuery.eq("user_id", user.id);
          purchaseQuery = purchaseQuery.eq("user_id", user.id);
        }
        if (startDate) {
          salesQuery = salesQuery.gte("sold_at", startDate);
          purchaseQuery = purchaseQuery.gte("ordered_at", startDate);
        }
        if (endDate) {
          salesQuery = salesQuery.lte("sold_at", `${endDate}T23:59:59`);
          purchaseQuery = purchaseQuery.lte("ordered_at", `${endDate}T23:59:59`);
        }
        const [{ data: sales }, { data: purchases }] = await Promise.all([
          salesQuery,
          purchaseQuery,
        ]);
        const canonical = await loadCanonicalSaleLines(
          (sales ?? []).map((sale) => String(sale.id)),
          "sale_id,category_id,category_name,quantity,total_amount",
        );
        if (canonical.error) return errorJson(500, canonical.error);
        const purchaseProductCategoryMap = new Map(
          (products ?? []).map((product) => [String(product.id), product.category_id]),
        );
        const summary = new Map(
          (categories ?? []).map((category) => [
            category.id,
            {
              categoryId: category.id,
              category: category.name,
              isActive: category.is_active,
              productCount: 0,
              stockQuantity: 0,
              inventoryCostValue: 0,
              inventoryRetailValue: 0,
              unitsSold: 0,
              salesValue: 0,
              purchaseQuantity: 0,
              purchaseValue: 0,
              lowStockCount: 0,
            },
          ]),
        );
        for (const product of products ?? []) {
          const row = summary.get(product.category_id);
          if (!row) continue;
          const stock = Number(product.stock ?? 0);
          row.productCount += 1;
          row.stockQuantity += stock;
          row.inventoryCostValue += stock * Number(product.cost ?? 0);
          row.inventoryRetailValue += stock * Number(product.price ?? 0);
          if (stock <= 5) row.lowStockCount += 1;
        }
        for (const line of canonical.lines) {
          const historicalCategoryId = String(line.category_id ?? "");
          if (historicalCategoryId && !summary.has(historicalCategoryId) && line.category_name) {
            summary.set(historicalCategoryId, {
              categoryId: historicalCategoryId,
              category: String(line.category_name),
              isActive: false,
              productCount: 0,
              stockQuantity: 0,
              inventoryCostValue: 0,
              inventoryRetailValue: 0,
              unitsSold: 0,
              salesValue: 0,
              purchaseQuantity: 0,
              purchaseValue: 0,
              lowStockCount: 0,
            });
          }
          const row = summary.get(historicalCategoryId);
          if (!row || line.quantity == null || line.total_amount == null) continue;
          row.unitsSold += Number(line.quantity);
          row.salesValue += Number(line.total_amount);
        }
        const accumulatePurchases = (records: Array<{ items: unknown }> | null) => {
          for (const record of records ?? [])
            for (const item of Array.isArray(record.items)
              ? (record.items as TransactionItem[])
              : []) {
              const categoryId = String(
                item.categoryId ??
                  item.category_id ??
                  purchaseProductCategoryMap.get(String(item.productId ?? item.product_id ?? "")) ??
                  "",
              );
              const row = summary.get(categoryId);
              if (!row) continue;
              const quantity = Number(item.quantity ?? 0);
              const value = Number(
                item.total ?? quantity * Number(item.unitCost ?? item.unit_cost ?? 0),
              );
              row.purchaseQuantity += quantity;
              row.purchaseValue += value;
            }
        };
        accumulatePurchases(purchases);
        return json({ data: Array.from(summary.values()), startDate, endDate, scope: scope.scope });
      },
    },
  },
});
