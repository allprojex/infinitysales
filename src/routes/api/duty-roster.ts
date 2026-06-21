import { createFileRoute } from "@tanstack/react-router";
import { apiToRow, errorJson, json, parseQuery, requireHrmAccess, rowToApi, safeJson, sb } from "./_resource-helpers";

export const Route = createFileRoute("/api/duty-roster")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireHrmAccess(request);
        if (!user) return response;
        const { limit, page, offset, params } = parseQuery(request);
        let q = sb.from("duty_roster").select("*", { count: "exact" }).eq("user_id", user.id).order("shift_date", { ascending: true }).order("shift_start", { ascending: true }).range(offset, offset + limit - 1);
        const startDate = params.get("startDate");
        const endDate = params.get("endDate");
        if (startDate) q = q.gte("shift_date", startDate);
        if (endDate) q = q.lte("shift_date", endDate);
        const { data, error, count } = await q;
        if (error) return errorJson(500, error.message);
        return json({ data: (data ?? []).map(rowToApi), total: count ?? 0, page, limit });
      },
      POST: async ({ request }) => {
        const { user, response } = await requireHrmAccess(request);
        if (!user) return response;
        const body = await safeJson(request);
        if (!body?.userName || !body?.shiftDate) return errorJson(400, "userName and shiftDate are required");
        const row = { ...apiToRow(body), user_id: user.id };
        const { data, error } = await sb.from("duty_roster").insert(row as any).select("*").single();
        if (error) return errorJson(500, error.message);
        return json(rowToApi(data));
      },
    },
  },
});
