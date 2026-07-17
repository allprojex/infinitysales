import { createFileRoute } from "@tanstack/react-router";
import { requireUser, json } from "./_resource-helpers";
import { resolveWarehouseUuid, warehouseStockRows } from "./-stock-helpers";

export const Route = createFileRoute("/api/warehouses/$id/stock")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireUser(request);
        if (auth.response) return auth.response;
        const resolved = await resolveWarehouseUuid(auth.user.id, params.id);
        if (resolved.error) return json({ message: resolved.error }, { status: 404 });
        const categoryId = new URL(request.url).searchParams.get("categoryId");
        const stock = await warehouseStockRows(auth.user.id, resolved.warehouseId!, categoryId);
        if (stock.error) return json({ message: stock.error }, { status: 500 });
        return json(
          stock.rows.map((row) => ({
            product: {
              id: row.id,
              name: row.name,
              sku: row.sku,
              categoryId: row.categoryId,
              category: row.category,
            },
            stock: row.stock,
            price: row.price,
            cost: row.cost,
            reorderPoint: row.reorderPoint,
          })),
        );
      },
    },
  },
});
