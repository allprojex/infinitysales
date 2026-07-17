import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireUser, sb, dateRange } from "./_helpers";

export const Route = createFileRoute("/api/reports/purchases")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const { startDate, endDate } = dateRange(request);
        const categoryId = new URL(request.url).searchParams.get("categoryId");

        const { data: roleRows } = await sb
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id);
        const roles = new Set((roleRows ?? []).map((r) => r.role));
        const isPrivileged = roles.has("admin") || roles.has("manager");

        let q = sb
          .from("purchase_orders")
          .select(
            "id,reference,supplier_name,status,subtotal,tax,total,notes,expected_date,received_date,ordered_at,created_at,items",
          );
        if (!isPrivileged) q = q.eq("user_id", user.id);
        if (startDate) q = q.gte("ordered_at", startDate);
        if (endDate) q = q.lte("ordered_at", endDate + "T23:59:59");
        const { data, error } = await q;
        if (error) return errorJson(500, error.message);
        const rawRows = data ?? [];
        const productIds = Array.from(
          new Set(
            rawRows.flatMap((order) =>
              Array.isArray(order.items)
                ? order.items
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
        const rows = rawRows
          .map((order) => {
            const orderItems = Array.isArray(order.items)
              ? (order.items as Record<string, unknown>[])
              : [];
            const categories = Array.from(
              new Set(
                orderItems.map((item) =>
                  String(
                    item.categoryName ??
                      item.category_name ??
                      productCategories.get(String(item.productId ?? item.product_id ?? ""))
                        ?.name ??
                      "Other",
                  ),
                ),
              ),
            );
            const categoryIds = Array.from(
              new Set(
                orderItems
                  .map(
                    (item) =>
                      productCategories.get(String(item.productId ?? item.product_id ?? ""))?.id,
                  )
                  .filter(Boolean),
              ),
            );
            return { ...order, categories, categoryIds, itemCount: orderItems.length };
          })
          .filter((order) => !categoryId || order.categoryIds.includes(categoryId));
        const totalOrders = rows.length;
        const totalSpend = rows.reduce((s, r) => s + Number(r.total ?? 0), 0);
        const received = rows.filter(
          (r) => r.status === "received" || r.status === "completed",
        ).length;
        const pending = rows.filter(
          (r) => r.status === "pending" || r.status === "draft" || r.status === "ordered",
        ).length;
        const items = rows.map((order) => ({
          id: order.id,
          poNumber: order.reference ?? order.id,
          supplierName: order.supplier_name ?? "—",
          status: order.status ?? "draft",
          subtotal: Number(order.subtotal ?? 0),
          tax: Number(order.tax ?? 0),
          total: Number(order.total ?? 0),
          notes: order.notes,
          expectedDate: order.expected_date,
          receivedDate: order.received_date,
          createdAt: order.created_at,
          orderedAt: order.ordered_at,
          itemCount: order.itemCount,
          categories: order.categories,
        }));
        const monthlyMap = new Map<
          string,
          { month: string; monthKey: string; total: number; orders: number }
        >();
        const supplierMap = new Map<
          string,
          { supplierName: string; total: number; orders: number }
        >();
        const statusMap = new Map<string, { status: string; count: number; total: number }>();
        for (const item of items) {
          const date = new Date(item.orderedAt ?? item.createdAt);
          const monthKey = Number.isNaN(date.getTime())
            ? "Unknown"
            : date.toISOString().slice(0, 7);
          const month = Number.isNaN(date.getTime())
            ? "Unknown"
            : date.toLocaleString("en", { month: "short", year: "numeric" });
          const monthly = monthlyMap.get(monthKey) ?? { month, monthKey, total: 0, orders: 0 };
          monthly.total += item.total;
          monthly.orders += 1;
          monthlyMap.set(monthKey, monthly);
          const supplier = supplierMap.get(item.supplierName) ?? {
            supplierName: item.supplierName,
            total: 0,
            orders: 0,
          };
          supplier.total += item.total;
          supplier.orders += 1;
          supplierMap.set(item.supplierName, supplier);
          const status = statusMap.get(item.status) ?? { status: item.status, count: 0, total: 0 };
          status.count += 1;
          status.total += item.total;
          statusMap.set(item.status, status);
        }
        return json({
          totalOrders,
          totalSpend,
          received,
          pending,
          avgOrderValue: totalOrders ? totalSpend / totalOrders : 0,
          monthly: Array.from(monthlyMap.values()).sort((a, b) =>
            a.monthKey.localeCompare(b.monthKey),
          ),
          bySupplier: Array.from(supplierMap.values()).sort((a, b) => b.total - a.total),
          byStatus: Array.from(statusMap.values()),
          items,
          scope: isPrivileged ? "all" : "own",
        });
      },
    },
  },
});
