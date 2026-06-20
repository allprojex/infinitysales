import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireUser, sb } from "./_helpers";

export const Route = createFileRoute("/api/reports/top-customers")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const url = new URL(request.url);
        const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "5", 10) || 5, 50);
        const { data: sales, error } = await sb.from("sales").select("customer_id, total, status").eq("user_id", user.id).eq("status", "completed").not("customer_id", "is", null);
        if (error) return errorJson(500, error.message);
        const agg = new Map<string, { totalSpend: number; totalOrders: number }>();
        for (const s of sales ?? []) {
          const k = s.customer_id as string;
          if (!k) continue;
          const a = agg.get(k) ?? { totalSpend: 0, totalOrders: 0 };
          a.totalSpend += Number(s.total ?? 0);
          a.totalOrders += 1;
          agg.set(k, a);
        }
        const ids = Array.from(agg.keys());
        if (!ids.length) return json([]);
        const { data: customers } = await sb.from("customers").select("id, name, email, company").in("id", ids as any);
        const byId = new Map((customers ?? []).map((c: any) => [String(c.id), c]));
        const result = ids.map(id => {
          const c = byId.get(id);
          const a = agg.get(id)!;
          return c ? { id, name: c.name, email: c.email, company: (c as any).company, totalSpend: a.totalSpend, totalOrders: a.totalOrders } : null;
        }).filter(Boolean).sort((a: any, b: any) => b.totalSpend - a.totalSpend).slice(0, limit);
        return json(result);
      },
    },
  },
});
