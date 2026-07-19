import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireUser, sb } from "./_resource-helpers";

export const Route = createFileRoute("/api/loyalty/customers")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const { data, error } = await sb
          .from("loyalty_transactions")
          .select("customer_id, type, points")
          .eq("user_id", user.id);
        if (error) return errorJson(500, error.message);
        const totals = new Map<string, number>();
        for (const r of data ?? []) {
          const cur = totals.get(r.customer_id) ?? 0;
          const pts = Number(r.points) || 0;
          totals.set(r.customer_id, cur + (r.type === "redeem" ? -pts : pts));
        }
        const items = [...totals.entries()].map(([customerId, balance]) => ({
          customerId,
          balance,
        }));
        return json({ items, total: items.length });
      },
    },
  },
});
