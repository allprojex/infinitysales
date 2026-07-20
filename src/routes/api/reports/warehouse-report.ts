import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireUser, sb } from "./_helpers";
import { warehouseInventoryTotalsFor } from "../-stock-helpers";

export const Route = createFileRoute("/api/reports/warehouse-report")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const { data: warehouses, error } = await (sb as any)
          .from("warehouses")
          .select("id, uuid_id, name, location")
          .eq("user_id", user.id);
        if (error) return errorJson(500, error.message);
        const totals = await warehouseInventoryTotalsFor(user.id);
        if (totals.error) return errorJson(500, totals.error);
        const items = (warehouses ?? []).map((w: any) => {
          const stock = totals.totals.get(String(w.uuid_id ?? w.id)) ?? {
            totalUnits: 0,
            productCount: 0,
            retailValue: 0,
            costValue: 0,
          };
          return {
            id: w.id,
            uuidId: w.uuid_id ?? null,
            name: w.name,
            location: w.location,
            units: stock.totalUnits,
            productCount: stock.productCount,
            retailValue: stock.retailValue,
            costValue: stock.costValue,
          };
        });
        return json({ items, total: items.length });
      },
    },
  },
});
