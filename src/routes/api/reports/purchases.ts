import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireUser, sb, dateRange } from "./_helpers";

export const Route = createFileRoute("/api/reports/purchases")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const { startDate, endDate } = dateRange(request);

        const { data: roleRows } = await sb
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id);
        const roles = new Set((roleRows ?? []).map((r: any) => r.role));
        const isPrivileged = roles.has("admin") || roles.has("manager");

        let q = sb.from("purchase_orders").select("status, total, ordered_at");
        if (!isPrivileged) q = q.eq("user_id", user.id);
        if (startDate) q = q.gte("ordered_at", startDate);
        if (endDate) q = q.lte("ordered_at", endDate + "T23:59:59");
        const { data, error } = await q;
        if (error) return errorJson(500, error.message);
        const rows = data ?? [];
        const totalOrders = rows.length;
        const totalSpend = rows.reduce((s, r) => s + Number(r.total ?? 0), 0);
        const received = rows.filter(r => r.status === "received" || r.status === "completed").length;
        const pending = rows.filter(r => r.status === "pending" || r.status === "draft" || r.status === "ordered").length;
        return json({ totalOrders, totalSpend, received, pending, items: rows, scope: isPrivileged ? "all" : "own" });
      },
    },
  },
});
