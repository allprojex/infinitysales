import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireUser, sb, dateRange } from "./_helpers";
import { rowToApi } from "../_resource-helpers";

export const Route = createFileRoute("/api/reports/sales")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const { startDate, endDate } = dateRange(request);
        let q = sb.from("sales").select("*").eq("user_id", user.id).order("sold_at", { ascending: false });
        if (startDate) q = q.gte("sold_at", startDate);
        if (endDate) q = q.lte("sold_at", endDate + "T23:59:59");
        const { data, error } = await q;
        if (error) return errorJson(500, error.message);
        const items = (data ?? []).map(rowToApi);
        const totalRevenue = items.reduce((s: number, r: any) => s + Number(r.total ?? 0), 0);
        return json({ items, total: items.length, totalRevenue });
      },
    },
  },
});
