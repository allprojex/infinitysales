import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireUser, sb, dateRange, loadReportScope } from "./_helpers";
import { rowToApi } from "../_resource-helpers";

export const Route = createFileRoute("/api/reports/sales")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const scope = await loadReportScope(user.id);
        if (scope.error) return errorJson(500, scope.error);
        const { startDate, endDate } = dateRange(request);
        let q = sb.from("sales").select("*").order("sold_at", { ascending: false });
        if (!scope.isPrivileged) q = q.eq("user_id", user.id);
        if (startDate) q = q.gte("sold_at", startDate);
        if (endDate) q = q.lte("sold_at", endDate + "T23:59:59");
        const { data, error } = await q;
        if (error) return errorJson(500, error.message);
        const items = (data ?? []).map(rowToApi) as Record<string, unknown>[];
        const completed = items.filter((r) => r.status === "completed");
        const totalRevenue = completed.reduce((s, r) => s + Number(r.total ?? 0), 0);
        return json({
          items,
          total: items.length,
          totalSales: completed.length,
          totalRevenue,
          scope: scope.scope,
        });
      },
    },
  },
});
