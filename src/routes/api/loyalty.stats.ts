import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireUser, sb } from "./_resource-helpers";

export const Route = createFileRoute("/api/loyalty/stats")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const { data, error } = await sb
          .from("loyalty_transactions")
          .select("type, points, customer_id")
          .eq("user_id", user.id);
        if (error) return errorJson(500, error.message);
        let earned = 0,
          redeemed = 0;
        const customers = new Set<string>();
        for (const r of data ?? []) {
          const p = Number(r.points) || 0;
          if (r.type === "redeem") redeemed += p;
          else earned += p;
          customers.add(r.customer_id);
        }
        return json({ earned, redeemed, balance: earned - redeemed, customers: customers.size });
      },
    },
  },
});
