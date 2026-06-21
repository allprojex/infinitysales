import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireUser, sb, dateRange, loadReportScope } from "./_helpers";

export const Route = createFileRoute("/api/reports/profit-loss")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const scope = await loadReportScope(user.id);
        if (scope.error) return errorJson(500, scope.error);
        const { startDate, endDate } = dateRange(request);
        let sQ = sb.from("sales").select("total, status, sold_at").eq("status", "completed");
        let eQ = sb.from("expenses").select("amount, spent_at");
        if (!scope.isPrivileged) {
          sQ = sQ.eq("user_id", user.id);
          eQ = eQ.eq("user_id", user.id);
        }
        const [sales, expenses] = await Promise.all([
          startDate
            ? endDate
              ? sQ.gte("sold_at", startDate).lte("sold_at", endDate + "T23:59:59")
              : sQ.gte("sold_at", startDate)
            : sQ,
          startDate
            ? endDate
              ? eQ.gte("spent_at", startDate).lte("spent_at", endDate + "T23:59:59")
              : eQ.gte("spent_at", startDate)
            : eQ,
        ]);
        if (sales.error) return errorJson(500, sales.error.message);
        if (expenses.error) return errorJson(500, expenses.error.message);
        const revenue = (sales.data ?? []).reduce((s, r) => s + Number(r.total ?? 0), 0);
        const totalExpenses = (expenses.data ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);
        return json({
          revenue,
          expenses: totalExpenses,
          profit: revenue - totalExpenses,
          margin: revenue ? ((revenue - totalExpenses) / revenue) * 100 : 0,
        });
      },
    },
  },
});
