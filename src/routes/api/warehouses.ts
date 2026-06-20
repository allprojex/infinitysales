import { createFileRoute } from "@tanstack/react-router";
import { apiToRow, errorJson, json, parseQuery, requireUser, rowToApi, safeJson, sb } from "./_resource-helpers";

export const Route = createFileRoute("/api/warehouses")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const { limit, offset, search } = parseQuery(request);
        let q = sb.from("warehouses").select("*").eq("user_id", user.id).order("id", { ascending: false }).range(offset, offset + limit - 1);
        if (search) q = q.ilike("name", `%${search}%`);
        const { data, error } = await q;
        if (error) return errorJson(500, error.message);
        // Until the Products phase lands, totalUnits/productCount are zero.
        return json((data ?? []).map((r) => ({ ...rowToApi(r), totalUnits: 0, productCount: 0 })));
      },
      POST: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const body = await safeJson(request);
        if (!body?.name) return errorJson(400, "name is required");
        const row = { ...apiToRow(body), user_id: user.id };
        const { data, error } = await sb.from("warehouses").insert(row as any).select("*").single();
        if (error) return errorJson(500, error.message);
        return json(rowToApi(data));
      },
    },
  },
});
