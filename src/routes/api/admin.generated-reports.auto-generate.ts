/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { sb, requireAdmin, json } from "./_resource-helpers";

type ReportPeriod = "weekly" | "bimonthly" | "monthly";
const iso = (date: Date) => date.toISOString().slice(0, 10);

function currentPeriods(now: Date): Array<{
  period: ReportPeriod;
  label: string;
  start: string;
  end: string;
}> {
  const day = now.getDay() || 7;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - day + 1);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const halfStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() <= 15 ? 1 : 16);
  const halfEnd = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() <= 15 ? 15 : monthEnd.getDate(),
  );
  return [
    {
      period: "weekly",
      label: `Week of ${iso(weekStart)}`,
      start: iso(weekStart),
      end: iso(weekEnd),
    },
    {
      period: "bimonthly",
      label: `${iso(halfStart)} to ${iso(halfEnd)}`,
      start: iso(halfStart),
      end: iso(halfEnd),
    },
    {
      period: "monthly",
      label: now.toLocaleString("en-GH", { month: "long", year: "numeric" }),
      start: iso(monthStart),
      end: iso(monthEnd),
    },
  ];
}

export const Route = createFileRoute("/api/admin/generated-reports/auto-generate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (auth.response) return auth.response;
        let generated = 0;
        let skipped = 0;

        for (const window of currentPeriods(new Date())) {
          const from = `${window.start}T00:00:00.000Z`;
          const to = `${window.end}T23:59:59.999Z`;
          const [{ data: sales }, { data: purchases }, { data: expenses }, { count: lowStock }] =
            await Promise.all([
              sb
                .from("sales")
                .select("total,channel,items")
                .eq("user_id", auth.user.id)
                .gte("sold_at", from)
                .lte("sold_at", to),
              sb
                .from("purchase_orders")
                .select("total,status")
                .eq("user_id", auth.user.id)
                .gte("ordered_at", from)
                .lte("ordered_at", to),
              sb
                .from("expenses")
                .select("amount,status")
                .eq("user_id", auth.user.id)
                .gte("created_at", from)
                .lte("created_at", to),
              sb.from("products").select("id", { count: "exact", head: true }).lte("stock", 5),
            ]);

          const salesRows = sales ?? [];
          const purchaseRows = purchases ?? [];
          const expenseRows = expenses ?? [];
          const reportRows = [
            {
              type: "sales",
              title: `Sales Report — ${window.label}`,
              data: {
                reportPeriod: window.period,
                periodLabel: window.label,
                startDate: window.start,
                endDate: window.end,
                totalRevenue: salesRows.reduce((sum, row) => sum + Number(row.total ?? 0), 0),
                totalSales: salesRows.length,
                avgTransactionValue: salesRows.length
                  ? salesRows.reduce((sum, row) => sum + Number(row.total ?? 0), 0) /
                    salesRows.length
                  : 0,
              },
            },
            {
              type: "purchase",
              title: `Purchase Report — ${window.label}`,
              data: {
                reportPeriod: window.period,
                periodLabel: window.label,
                startDate: window.start,
                endDate: window.end,
                totalValue: purchaseRows.reduce((sum, row) => sum + Number(row.total ?? 0), 0),
                totalOrders: purchaseRows.length,
              },
            },
            {
              type: "expense",
              title: `Expense Report — ${window.label}`,
              data: {
                reportPeriod: window.period,
                periodLabel: window.label,
                startDate: window.start,
                endDate: window.end,
                totalExpenses: expenseRows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
                totalPurchaseOrders: purchaseRows.length,
                lowStockAlerts: lowStock ?? 0,
                expiringItems: 0,
              },
            },
          ];

          for (const report of reportRows) {
            const { data: existing } = await sb
              .from("generated_reports")
              .select("id")
              .eq("user_id", auth.user.id)
              .eq("type", report.type)
              .eq("period", window.period)
              .maybeSingle();
            if (existing) {
              skipped += 1;
              continue;
            }
            const { error } = await sb.from("generated_reports").insert({
              user_id: auth.user.id,
              type: report.type,
              title: report.title,
              period: window.period,
              status: "ready",
              data: report.data as any,
            });
            if (!error) generated += 1;
          }
        }
        return json({ generated, skipped });
      },
    },
  },
});
