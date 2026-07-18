import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireUser, sb } from "./_resource-helpers";

export const Route = createFileRoute("/api/supplier-invoices/summary")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const { data, error } = await sb
          .from("supplier_invoices")
          .select("total,paid,status,due_date")
          .eq("user_id", user.id);
        if (error) return errorJson(500, error.message);
        const today = new Date().toISOString().slice(0, 10);
        const summary = {
          total: data?.length ?? 0,
          unpaid: 0,
          partial: 0,
          paid: 0,
          overdue: 0,
          disputed: 0,
          outstanding_balance: "0.00",
          paid_total: "0.00",
          newly_overdue: 0,
        };
        let outstanding = 0;
        let paidTotal = 0;
        for (const row of data ?? []) {
          const status = row.status ?? "unpaid";
          if (status === "paid") summary.paid += 1;
          else if (status === "partial") summary.partial += 1;
          else if (status === "disputed") summary.disputed += 1;
          else summary.unpaid += 1;
          const paid = Number(row.paid ?? 0);
          paidTotal += paid;
          outstanding += Math.max(0, Number(row.total ?? 0) - paid);
          if (status !== "paid" && row.due_date && row.due_date < today) summary.overdue += 1;
        }
        summary.outstanding_balance = outstanding.toFixed(2);
        summary.paid_total = paidTotal.toFixed(2);
        return json(summary);
      },
    },
  },
});
