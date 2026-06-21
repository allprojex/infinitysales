import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireUser, sb, dateRange, loadReportScope } from "./_helpers";

export const Route = createFileRoute("/api/reports/cashier-performance")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const scope = await loadReportScope(user.id);
        if (scope.error) return errorJson(500, scope.error);
        const { startDate, endDate } = dateRange(request);
        let q = sb.from("sales").select("total, sold_at, status").eq("status", "completed");
        if (!scope.isPrivileged) q = q.eq("user_id", user.id);
        if (startDate) q = q.gte("sold_at", startDate);
        if (endDate) q = q.lte("sold_at", endDate + "T23:59:59");
        const { data, error } = await q;
        if (error) return errorJson(500, error.message);
        const rows = data ?? [];
        const total = rows.reduce((s, r) => s + Number(r.total ?? 0), 0);
        return json({
          items: [{ cashier: "—", totalSales: rows.length, totalRevenue: total }],
          total: rows.length,
          totalRevenue: total,
        });
      },
    },
  },
});
