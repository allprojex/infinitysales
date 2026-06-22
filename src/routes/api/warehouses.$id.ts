import { createFileRoute } from "@tanstack/react-router";
import { apiToRow, errorJson, json, requireUser, rowToApi, safeJson, sb } from "./_resource-helpers";
import { warehouseTotals } from "./-stock-helpers";

export const Route = createFileRoute("/api/warehouses/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const { data, error } = await sb.from("warehouses").select("*").eq("user_id", user.id).eq("id", Number(params.id)).maybeSingle();
        if (error) return errorJson(500, error.message);
        if (!data) return errorJson(404, "Not found");
        const totals = await warehouseTotals(user.id);
        if (totals.error) return errorJson(500, totals.error);
        return json({
          ...rowToApi(data),
          ...(totals.totals.get(String((data as any).uuid_id ?? data.id)) ?? { totalUnits: 0, productCount: 0 }),
        });
      },
      PUT: async ({ request, params }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const body = await safeJson(request);
        const { data, error } = await sb.from("warehouses").update(apiToRow(body) as any).eq("user_id", user.id).eq("id", Number(params.id)).select("*").maybeSingle();
        if (error) return errorJson(500, error.message);
        if (!data) return errorJson(404, "Warehouse not found");
        return json(rowToApi(data));
      },
      DELETE: async ({ request, params }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const { data, error } = await sb.from("warehouses").delete().eq("user_id", user.id).eq("id", Number(params.id)).select("id").maybeSingle();
        if (error) return errorJson(500, error.message);
        if (!data) return errorJson(404, "Warehouse not found");
        return json({ ok: true });
      },
    },
  },
});
