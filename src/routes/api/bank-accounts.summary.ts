import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireUser, sb } from "./_resource-helpers";

export const Route = createFileRoute("/api/bank-accounts/summary")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const { data: accounts, error } = await sb
          .from("bank_accounts")
          .select("current_balance, is_active")
          .eq("user_id", user.id);
        if (error) return errorJson(500, error.message);
        const totalAccounts = accounts?.length ?? 0;
        const activeAccounts = (accounts ?? []).filter((a: any) => a.is_active).length;
        const totalBalance = (accounts ?? []).reduce(
          (s: number, a: any) => s + (Number(a.current_balance) || 0),
          0,
        );
        const { count: unreconciledTxns, error: txnError } = await sb
          .from("bank_transactions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("reconciled", false);
        if (txnError) return errorJson(500, txnError.message);
        return json({
          total_accounts: totalAccounts,
          active_accounts: activeAccounts,
          total_balance: totalBalance,
          unreconciled_txns: unreconciledTxns ?? 0,
        });
      },
    },
  },
});
