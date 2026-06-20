import { createFileRoute } from "@tanstack/react-router";
import { sb, requireUser, json } from "./_resource-helpers";

export const Route = createFileRoute("/api/warehouses/$id/stock")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireUser(request); if (auth.response) return auth.response;
        const wid = Number(params.id);
        const { data, error } = await sb.from("products").select("id,name,sku,stock,reorder_point,price,cost")
          .eq("warehouse_id", isNaN(wid) ? (params.id as any) : wid)
          .order("name");
        if (error) return json({ message: error.message }, { status: 500 });
        return json((data ?? []).map((p: any) => ({
          id: p.id, name: p.name, sku: p.sku, stock: p.stock,
          reorderPoint: p.reorder_point, price: p.price, cost: p.cost,
        })));
      },
    },
  },
});
