import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireUser, sb, monthsAgoISO } from "./_helpers";

export const Route = createFileRoute("/api/reports/summary")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const monthStart = monthsAgoISO(0);
        const prevMonthStart = monthsAgoISO(1);

        // Role-aware scope: admins + managers see system-wide cash totals.
        const { data: roleRows } = await sb
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id);
        const roles = new Set((roleRows ?? []).map((r: any) => r.role));
        const isPrivileged = roles.has("admin") || roles.has("manager");

        let salesQ = sb.from("sales").select("total, status, sold_at");
        if (!isPrivileged) salesQ = salesQ.eq("user_id", user.id);
        let newCustQ = sb.from("customers").select("*", { count: "exact", head: true }).gte("created_at", monthStart);
        if (!isPrivileged) newCustQ = newCustQ.eq("user_id", user.id);
        let custQ = sb.from("customers").select("*", { count: "exact", head: true });
        if (!isPrivileged) custQ = custQ.eq("user_id", user.id);

        const [{ data: salesAll, error: e1 }, { count: custCount }, { count: prodCount }] = await Promise.all([
          salesQ,
          custQ,
          sb.from("products").select("*", { count: "exact", head: true }),
        ]);
        if (e1) return errorJson(500, e1.message);
        const rows = salesAll ?? [];
        const completed = rows.filter(r => r.status === "completed");
        const pending = rows.filter(r => r.status === "pending").length;
        const cancelled = rows.filter(r => r.status === "cancelled").length;
        const totalRevenue = completed.reduce((s, r) => s + Number(r.total ?? 0), 0);
        const thisMonth = completed.filter(r => r.sold_at >= monthStart);
        const prevMonth = completed.filter(r => r.sold_at >= prevMonthStart && r.sold_at < monthStart);
        const revenueThisMonth = thisMonth.reduce((s, r) => s + Number(r.total ?? 0), 0);
        const revenuePrev = prevMonth.reduce((s, r) => s + Number(r.total ?? 0), 0);
        const salesThisMonth = thisMonth.length;
        const salesPrev = prevMonth.length;

        const { count: newCust } = await newCustQ;

        return json({
          totalRevenue, totalSales: completed.length,
          totalCustomers: custCount ?? 0, totalProducts: prodCount ?? 0,
          revenueThisMonth, salesThisMonth, newCustomersThisMonth: newCust ?? 0,
          pendingSales: pending, completedSales: completed.length, cancelledSales: cancelled,
          revenueGrowth: revenuePrev > 0 ? ((revenueThisMonth - revenuePrev) / revenuePrev) * 100 : 0,
          salesGrowth: salesPrev > 0 ? ((salesThisMonth - salesPrev) / salesPrev) * 100 : 0,
          scope: isPrivileged ? "all" : "own",
        });
      },
    },
  },
});
