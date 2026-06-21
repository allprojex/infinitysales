import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireUser, sb } from "./_resource-helpers";

export const Route = createFileRoute("/api/expenses/stats")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const now = new Date();
        const currentMonth = now.toISOString().slice(0, 7);
        const currentYear = String(now.getUTCFullYear());
        const { data, error } = await sb
          .from("expenses")
          .select("amount, category, status, expense_date, spent_at");
        if (error) return errorJson(500, error.message);

        const categoryMap = new Map<string, { category: string; total: number; count: number }>();
        const statusMap = new Map<string, { status: string; total: number; count: number }>();
        const thisMonth = { total: 0, count: 0 };
        const thisYear = { total: 0, count: 0 };

        for (const row of data ?? []) {
          const expense = row as Record<string, unknown>;
          const amount = Number(row.amount) || 0;
          const dateText = String(expense.expense_date ?? row.spent_at ?? "");
          const category = row.category || "Uncategorized";
          const status = String(expense.status || "pending");

          const cat = categoryMap.get(category) ?? { category, total: 0, count: 0 };
          cat.total += amount;
          cat.count += 1;
          categoryMap.set(category, cat);

          const stat = statusMap.get(status) ?? { status, total: 0, count: 0 };
          stat.total += amount;
          stat.count += 1;
          statusMap.set(status, stat);

          if (dateText.slice(0, 7) === currentMonth) {
            thisMonth.total += amount;
            thisMonth.count += 1;
          }
          if (dateText.slice(0, 4) === currentYear) {
            thisYear.total += amount;
            thisYear.count += 1;
          }
        }

        return json({
          thisMonth,
          thisYear,
          byCategory: Array.from(categoryMap.values()).sort((a, b) => b.total - a.total),
          byStatus: Array.from(statusMap.values()).sort((a, b) => b.total - a.total),
        });
      },
    },
  },
});
