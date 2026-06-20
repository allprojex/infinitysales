import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireUser, sb } from "./_helpers";

export const Route = createFileRoute("/api/reports/pos-today-cash")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;

        // Role-aware scope: admins + managers see system-wide cash totals.
        const { data: roleRows } = await sb
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id);
        const roles = new Set((roleRows ?? []).map((r: { role: string }) => r.role));
        const isPrivileged = roles.has("admin") || roles.has("manager");

        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const startISO = start.toISOString();

        let q = sb
          .from("sales")
          .select("total, status, payment_method, sold_at")
          .gte("sold_at", startISO);
        if (!isPrivileged) q = q.eq("user_id", user.id);

        const { data, error } = await q;
        if (error) return errorJson(500, error.message);

        const rows = (data ?? []).filter(
          (r) => r.status === "completed" && r.payment_method === "cash",
        );
        const total = rows.reduce((s, r) => s + Number(r.total ?? 0), 0);

        return json({
          total,
          count: rows.length,
          scope: isPrivileged ? "all" : "own",
          currency: "GHS",
        });
      },
    },
  },
});
