import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireUser, sb, dateRange, loadReportScope } from "./_helpers";
import { rowToApi } from "../_resource-helpers";

export const Route = createFileRoute("/api/reports/expenses")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const scope = await loadReportScope(user.id);
        if (scope.error) return errorJson(500, scope.error);
        const { startDate, endDate } = dateRange(request);
        let q = sb.from("expenses").select("*").order("spent_at", { ascending: false });
        if (!scope.isPrivileged) q = q.eq("user_id", user.id);
        if (startDate) q = q.gte("spent_at", startDate);
        if (endDate) q = q.lte("spent_at", endDate + "T23:59:59");
        const { data, error } = await q;
        if (error) return errorJson(500, error.message);
        const items = (data ?? []).map(rowToApi) as Array<{ amount?: unknown }>;
        const total = items.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
        return json({ items, total, count: items.length });
      },
    },
  },
});
