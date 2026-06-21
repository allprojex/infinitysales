import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireUser, sb, dateRange, loadReportScope } from "./_helpers";

export const Route = createFileRoute("/api/reports/deposits")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const scope = await loadReportScope(user.id);
        if (scope.error) return errorJson(500, scope.error);
        const { startDate, endDate } = dateRange(request);
        let q = sb
          .from("sales")
          .select("paid, payment_method, sold_at, status")
          .eq("status", "completed");
        if (!scope.isPrivileged) q = q.eq("user_id", user.id);
        if (startDate) q = q.gte("sold_at", startDate);
        if (endDate) q = q.lte("sold_at", endDate + "T23:59:59");
        const { data, error } = await q;
        if (error) return errorJson(500, error.message);
        const rows = data ?? [];
        const byMethod: Record<string, number> = {};
        let total = 0;
        for (const r of rows) {
          const m = (r.payment_method ?? "cash") as string;
          const amt = Number(r.paid ?? 0);
          byMethod[m] = (byMethod[m] ?? 0) + amt;
          total += amt;
        }
        return json({ total, count: rows.length, byMethod });
      },
    },
  },
});
