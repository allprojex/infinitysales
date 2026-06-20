import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireUser, sb } from "./_resource-helpers";

export const Route = createFileRoute("/api/customer-credits/summary")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const { data, error } = await sb.from("customer_credits").select("amount, type, customer_id").eq("user_id", user.id);
        if (error) return errorJson(500, error.message);
        let totalCredit = 0, totalDebit = 0;
        const customers = new Set<string>();
        for (const r of data ?? []) {
          const a = Number(r.amount) || 0;
          if (r.type === "debit") totalDebit += a; else totalCredit += a;
          customers.add(r.customer_id);
        }
        return json({ totalCredit, totalDebit, outstanding: totalCredit - totalDebit, customers: customers.size });
      },
    },
  },
});
