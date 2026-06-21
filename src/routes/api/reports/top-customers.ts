import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireUser, sb, loadReportScope } from "./_helpers";

type CustomerLookup = {
  id: number;
  uuid_id?: string | null;
  name: string;
  email: string;
  company?: string | null;
};

export const Route = createFileRoute("/api/reports/top-customers")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const scope = await loadReportScope(user.id);
        if (scope.error) return errorJson(500, scope.error);
        const url = new URL(request.url);
        const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "5", 10) || 5, 50);
        let q = sb
          .from("sales")
          .select("customer_id, total, status")
          .eq("status", "completed")
          .not("customer_id", "is", null);
        if (!scope.isPrivileged) q = q.eq("user_id", user.id);
        const { data: sales, error } = await q;
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
        let customersQ = sb
          .from("customers")
          .select("id, uuid_id, name, email, company")
          .in("uuid_id", ids);
        if (!scope.isPrivileged) customersQ = customersQ.eq("user_id", user.id);
        const { data: customers } = await customersQ;
        const byId = new Map(
          ((customers ?? []) as CustomerLookup[]).map((c) => [String(c.uuid_id ?? c.id), c]),
        );
        const result = ids
          .map((id) => {
            const c = byId.get(id);
            const a = agg.get(id)!;
            return c
              ? {
                  id: c.id,
                  uuidId: c.uuid_id ?? null,
                  name: c.name,
                  email: c.email,
                  company: c.company,
                  totalSpend: a.totalSpend,
                  totalOrders: a.totalOrders,
                }
              : null;
          })
          .filter((row): row is NonNullable<typeof row> => row !== null)
          .sort((a, b) => b.totalSpend - a.totalSpend)
          .slice(0, limit);
        return json(result);
      },
    },
  },
});
