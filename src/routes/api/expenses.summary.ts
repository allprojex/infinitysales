import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireUser, sb } from "./_resource-helpers";

// Alias for /api/expenses/stats — some callers request /summary.
// Without this file, requests would match expenses.$id.ts with id="summary"
// and crash with `invalid input syntax for type uuid: "summary"`.
export const Route = createFileRoute("/api/expenses/summary")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const { user, response } = await requireUser(request);
          if (!user) return response;
          const { data, error } = await sb
            .from("expenses")
            .select("amount, category, spent_at")
            .eq("user_id", user.id);
          if (error) return errorJson(500, error.message);

          const rows = data ?? [];
          const byCategory: Array<{ category: string; total: number; count: number }> = [];
          const catMap: Record<string, { total: number; count: number }> = {};
          const byStatus: Array<{ status: string; total: number; count: number }> = [];
          const statusMap: Record<string, { total: number; count: number }> = {};

          const now = new Date();
          const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          const thisMonthKey = ym(now);
          const thisYearStr = String(now.getFullYear());

          let thisMonth = { total: 0, count: 0 };
          let thisYear = { total: 0, count: 0 };
          let total = 0;

          for (const r of rows) {
            const a = Number(r.amount) || 0;
            total += a;
            const cat = (r.category as string) || "Uncategorized";
            const st = "pending";
            catMap[cat] = { total: (catMap[cat]?.total ?? 0) + a, count: (catMap[cat]?.count ?? 0) + 1 };
            statusMap[st] = { total: (statusMap[st]?.total ?? 0) + a, count: (statusMap[st]?.count ?? 0) + 1 };
            const d = String(r.spent_at ?? "");
            if (d.startsWith(thisMonthKey)) { thisMonth.total += a; thisMonth.count += 1; }
            if (d.startsWith(thisYearStr))  { thisYear.total  += a; thisYear.count  += 1; }
          }

          for (const [category, v] of Object.entries(catMap)) byCategory.push({ category, ...v });
          byCategory.sort((a, b) => b.total - a.total);
          for (const [status, v] of Object.entries(statusMap)) byStatus.push({ status, ...v });

          return json({ total, count: rows.length, thisMonth, thisYear, byCategory, byStatus });
        } catch (err) {
          console.error("[/api/expenses/summary]", err);
          // Return 200 with fallback signal so callers can render a graceful empty state
          // instead of crashing the page on a 500.
          return json({
            total: 0, count: 0,
            thisMonth: { total: 0, count: 0 },
            thisYear: { total: 0, count: 0 },
            byCategory: [], byStatus: [],
            error: "SERVICE_FAILED", fallback: true,
          });
        }
      },
    },
  },
});
