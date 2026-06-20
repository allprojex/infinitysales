import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireUser, sb } from "./_helpers";
import { rowToApi } from "../_resource-helpers";

export const Route = createFileRoute("/api/reports/recent-sales")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const url = new URL(request.url);
        const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "10", 10) || 10, 50);
        const { data, error } = await sb.from("sales").select("*").eq("user_id", user.id).order("sold_at", { ascending: false }).limit(limit);
        if (error) return errorJson(500, error.message);
        const rows = data ?? [];
        const customerIds = Array.from(new Set(rows.map((r: any) => r.customer_id).filter(Boolean)));
        const nameMap = new Map<string, string>();
        if (customerIds.length) {
          const { data: cs } = await sb.from("customers").select("id,name").eq("user_id", user.id).in("id", customerIds as any);
          for (const c of cs ?? []) nameMap.set(String((c as any).id), (c as any).name);
        }
        return json(rows.map((r: any) => {
          const out = rowToApi(r) as any;
          out.customerName = r.customer_id ? nameMap.get(String(r.customer_id)) ?? null : null;
          return out;
        }));
      },
    },
  },
});
