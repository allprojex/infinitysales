import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireUser, sb } from "./_helpers";

export const Route = createFileRoute("/api/reports/customers")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const [{ data: customers, error: e1 }, { data: sales, error: e2 }] = await Promise.all([
          sb.from("customers").select("id, name, email, phone, created_at").eq("user_id", user.id),
          sb.from("sales").select("customer_id, total, status").eq("user_id", user.id).eq("status", "completed"),
        ]);
        if (e1 || e2) return errorJson(500, (e1 ?? e2)!.message);
        const spend = new Map<string, { totalSpend: number; totalOrders: number }>();
        for (const s of sales ?? []) {
          if (!s.customer_id) continue;
          const a = spend.get(s.customer_id as string) ?? { totalSpend: 0, totalOrders: 0 };
          a.totalSpend += Number(s.total ?? 0); a.totalOrders += 1;
          spend.set(s.customer_id as string, a);
        }
        const items = (customers ?? []).map((c: any) => {
          const a = spend.get(String(c.id)) ?? { totalSpend: 0, totalOrders: 0 };
          return { id: c.id, name: c.name, email: c.email, phone: c.phone, createdAt: c.created_at, ...a };
        });
        return json({ items, total: items.length });
      },
    },
  },
});
