import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireUser, sb } from "./_resource-helpers";

export const Route = createFileRoute("/api/supplier-invoices/summary")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const { data, error } = await sb.from("supplier_invoices").select("total, paid, status, due_date").eq("user_id", user.id);
        if (error) return errorJson(500, error.message);
        const now = Date.now();
        let totalAmount = 0, totalPaid = 0, overdueAmount = 0, overdueCount = 0;
        for (const r of data ?? []) {
          const t = Number(r.total) || 0; const p = Number(r.paid) || 0;
          totalAmount += t; totalPaid += p;
          if (r.status !== "paid" && r.due_date && new Date(r.due_date).getTime() < now) {
            overdueAmount += t - p; overdueCount += 1;
          }
        }
        return json({ totalAmount, totalPaid, outstanding: totalAmount - totalPaid, overdueAmount, overdueCount, count: data?.length ?? 0 });
      },
    },
  },
});
