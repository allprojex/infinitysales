import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireUser, sb } from "./_resource-helpers";

export const Route = createFileRoute("/api/expenses/stats")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const { data, error } = await sb.from("expenses").select("amount, category, spent_at").eq("user_id", user.id);
        if (error) return errorJson(500, error.message);
        const byCategory: Record<string, number> = {};
        const monthKey = (d: string) => (d || "").slice(0, 7);
        const byMonth: Record<string, number> = {};
        let total = 0;
        for (const r of data ?? []) {
          const a = Number(r.amount) || 0;
          total += a;
          const c = r.category || "Uncategorized";
          byCategory[c] = (byCategory[c] || 0) + a;
          const m = monthKey(r.spent_at as any);
          if (m) byMonth[m] = (byMonth[m] || 0) + a;
        }
        return json({ total, count: data?.length ?? 0, byCategory, byMonth });
      },
    },
  },
});
