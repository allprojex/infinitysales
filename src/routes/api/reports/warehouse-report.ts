import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireUser, sb } from "./_helpers";

export const Route = createFileRoute("/api/reports/warehouse-report")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const [{ data: warehouses, error: e1 }, { data: products, error: e2 }] = await Promise.all([
          sb.from("warehouses").select("id, name, location").eq("user_id", user.id),
          sb.from("products").select("warehouse_id, stock, price, cost").eq("is_active", true),
        ]);
        if (e1 || e2) return errorJson(500, (e1 ?? e2)!.message);
        const byWh = new Map<string, { units: number; retailValue: number; costValue: number; productCount: number }>();
        for (const p of products ?? []) {
          const k = (p.warehouse_id ?? "unassigned") as string;
          const a = byWh.get(k) ?? { units: 0, retailValue: 0, costValue: 0, productCount: 0 };
          const stock = Number(p.stock ?? 0);
          a.units += stock;
          a.retailValue += stock * Number(p.price ?? 0);
          a.costValue += stock * Number(p.cost ?? 0);
          a.productCount += 1;
          byWh.set(k, a);
        }
        const items = (warehouses ?? []).map((w: any) => ({ id: w.id, name: w.name, location: w.location, ...(byWh.get(String(w.id)) ?? { units: 0, retailValue: 0, costValue: 0, productCount: 0 }) }));
        return json({ items, total: items.length });
      },
    },
  },
});
