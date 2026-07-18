/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { sb, requireAdmin, parseQuery, json } from "./_resource-helpers";

const typeMap: Record<string, string> = { inventory: "purchase", "profit-loss": "expense" };

export const Route = createFileRoute("/api/admin/generated-reports")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (auth.response) return auth.response;
        const { params } = parseQuery(request);
        let q = sb.from("generated_reports").select("*").eq("user_id", auth.user.id);
        const type = params.get("type");
        const period = params.get("period");
        if (type && type !== "all")
          q = q.in("type", [
            type,
            ...(type === "purchase" ? ["inventory"] : []),
            ...(type === "expense" ? ["profit-loss"] : []),
          ]);
        if (period && period !== "all") q = q.eq("period", period);
        const { data, error } = await q.order("created_at", { ascending: false }).limit(200);
        if (error) return json({ message: error.message }, { status: 500 });
        const rows = (data ?? []).map((row: any) => {
          const details = row.data && typeof row.data === "object" ? row.data : {};
          const reportPeriod = ["weekly", "bimonthly", "monthly"].includes(row.period)
            ? row.period
            : (details.reportPeriod ?? "monthly");
          const createdDate = String(row.created_at).slice(0, 10);
          return {
            id: row.id,
            reportType: typeMap[row.type] ?? row.type,
            period: reportPeriod,
            title: row.title,
            periodLabel: details.periodLabel ?? row.period ?? createdDate,
            startDate: details.startDate ?? createdDate,
            endDate: details.endDate ?? createdDate,
            data: details,
            notes: row.notes,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          };
        });
        return json({ data: rows, total: rows.length });
      },
    },
  },
});
