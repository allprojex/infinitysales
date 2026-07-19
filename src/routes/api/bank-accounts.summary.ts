import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireUser, sb } from "./_resource-helpers";

export const Route = createFileRoute("/api/bank-accounts/summary")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const { data, error } = await sb
          .from("bank_accounts")
          .select("current_balance, currency, is_active")
          .eq("user_id", user.id);
        if (error) return errorJson(500, error.message);
        const byCurrency: Record<string, number> = {};
        let totalAccounts = 0,
          activeAccounts = 0;
        for (const r of data ?? []) {
          totalAccounts++;
          if (r.is_active) activeAccounts++;
          const c = r.currency || "USD";
          byCurrency[c] = (byCurrency[c] || 0) + (Number(r.current_balance) || 0);
        }
        return json({ totalAccounts, activeAccounts, balanceByCurrency: byCurrency });
      },
    },
  },
});
