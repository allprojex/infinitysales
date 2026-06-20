import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireUser, sb, dateRange } from "./_helpers";
import { rowToApi } from "../_resource-helpers";

export const Route = createFileRoute("/api/reports/expenses")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const { startDate, endDate } = dateRange(request);
        let q = sb.from("expenses").select("*").eq("user_id", user.id).order("spent_at", { ascending: false });
        if (startDate) q = q.gte("spent_at", startDate);
        if (endDate) q = q.lte("spent_at", endDate + "T23:59:59");
        const { data, error } = await q;
        if (error) return errorJson(500, error.message);
        const items = (data ?? []).map(rowToApi);
        const total = items.reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);
        return json({ items, total, count: items.length });
      },
    },
  },
});
