import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireUser, sb, loadReportScope } from "./_helpers";
import { rowToApi } from "../_resource-helpers";

type RecentSaleRow = Record<string, unknown> & { customer_id?: string | null };
type RecentCustomerRow = { id: number; uuid_id?: string | null; name: string };

export const Route = createFileRoute("/api/reports/recent-sales")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const scope = await loadReportScope(user.id);
        if (scope.error) return errorJson(500, scope.error);
        const url = new URL(request.url);
        const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "10", 10) || 10, 50);
        let q = sb.from("sales").select("*").order("sold_at", { ascending: false }).limit(limit);
        if (!scope.isPrivileged) q = q.eq("user_id", user.id);
        const { data, error } = await q;
        if (error) return errorJson(500, error.message);
        const rows = (data ?? []) as RecentSaleRow[];
        const customerIds = Array.from(new Set(rows.map((r) => r.customer_id).filter(Boolean)));
        const nameMap = new Map<string, string>();
        if (customerIds.length) {
          let customersQ = sb
            .from("customers")
            .select("id,uuid_id,name")
            .in("uuid_id", customerIds as string[]);
          if (!scope.isPrivileged) customersQ = customersQ.eq("user_id", user.id);
          const { data: cs } = await customersQ;
          for (const c of (cs ?? []) as RecentCustomerRow[])
            nameMap.set(String(c.uuid_id ?? c.id), c.name);
        }
        return json(
          rows.map((r) => {
            const out = rowToApi(r) as Record<string, unknown>;
            out.customerName = r.customer_id ? (nameMap.get(String(r.customer_id)) ?? null) : null;
            return out;
          }),
        );
      },
    },
  },
});
