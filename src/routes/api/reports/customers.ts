import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireUser, sb, loadReportScope } from "./_helpers";

type CustomerReportRow = {
  id: number;
  uuid_id?: string | null;
  name: string;
  email: string;
  phone?: string | null;
  company?: string | null;
  city?: string | null;
  created_at?: string;
};

export const Route = createFileRoute("/api/reports/customers")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const scope = await loadReportScope(user.id);
        if (scope.error) return errorJson(500, scope.error);
        let customersQ = sb
          .from("customers")
          .select("id, uuid_id, name, email, phone, company, city, created_at");
        let salesQ = sb
          .from("sales")
          .select("customer_id, total, status")
          .eq("status", "completed");
        if (!scope.isPrivileged) {
          customersQ = customersQ.eq("user_id", user.id);
          salesQ = salesQ.eq("user_id", user.id);
        }
        const [{ data: customers, error: e1 }, { data: sales, error: e2 }] = await Promise.all([
          customersQ,
          salesQ,
        ]);
        if (e1 || e2) return errorJson(500, (e1 ?? e2)!.message);
        const spend = new Map<string, { totalSpend: number; totalOrders: number }>();
        for (const s of sales ?? []) {
          if (!s.customer_id) continue;
          const a = spend.get(s.customer_id as string) ?? { totalSpend: 0, totalOrders: 0 };
          a.totalSpend += Number(s.total ?? 0);
          a.totalOrders += 1;
          spend.set(s.customer_id as string, a);
        }
        const items = ((customers ?? []) as CustomerReportRow[]).map((c) => {
          const a = spend.get(String(c.uuid_id ?? c.id)) ?? { totalSpend: 0, totalOrders: 0 };
          return {
            id: c.id,
            name: c.name,
            email: c.email,
            phone: c.phone,
            company: c.company ?? null,
            city: c.city ?? null,
            createdAt: c.created_at,
            ...a,
          };
        });
        return json({
          items,
          total: items.length,
          totalRevenue: items.reduce((sum, c) => sum + c.totalSpend, 0),
          scope: scope.scope,
        });
      },
    },
  },
});
