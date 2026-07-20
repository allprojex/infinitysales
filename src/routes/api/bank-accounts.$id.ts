import { createFileRoute } from "@tanstack/react-router";
import {
  errorJson,
  itemHandlers,
  json,
  profileNameMap,
  requireUser,
  safeJson,
  sb,
} from "./_resource-helpers";
import { withBalanceAfter } from "./-bank-helpers";

const generic = itemHandlers({ table: "bank_accounts" });

export const Route = createFileRoute("/api/bank-accounts/$id")({
  server: {
    handlers: {
      // bank-reconciliation.tsx expects { account, transactions, stats } here, not a
      // bare account row -- the page reads detail.account / detail.transactions / detail.stats.
      GET: async ({ request, params }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const { data: account, error } = await sb
          .from("bank_accounts")
          .select("*")
          .eq("user_id", user.id)
          .eq("id", params.id)
          .maybeSingle();
        if (error) return errorJson(500, error.message);
        if (!account) return errorJson(404, "Account not found");

        const { data: txnRows, error: txnError } = await sb
          .from("bank_transactions")
          .select("*")
          .eq("user_id", user.id)
          .eq("bank_account_id", params.id)
          .order("occurred_at", { ascending: true })
          .order("created_at", { ascending: true });
        if (txnError) return errorJson(500, txnError.message);

        const rows = txnRows ?? [];
        const nameMap = await profileNameMap(rows.map((t: any) => t.user_id));
        const withBalances = withBalanceAfter(Number((account as any).opening_balance ?? 0), rows);
        const transactions = withBalances
          .map((t: any) => ({
            id: t.id,
            account_id: t.bank_account_id,
            txn_date: t.occurred_at,
            description: t.description,
            type: t.type,
            amount: Number(t.amount),
            balance_after: t.balance_after,
            reference: t.reference,
            reconciled: t.reconciled,
            notes: t.notes,
            created_by_name: nameMap.get(String(t.user_id)) ?? null,
            created_at: t.created_at,
          }))
          .reverse();

        let reconciledTxns = 0;
        let totalCredits = 0;
        let totalDebits = 0;
        for (const t of rows) {
          if ((t as any).reconciled) reconciledTxns++;
          const amount = Number((t as any).amount) || 0;
          if ((t as any).type === "credit") totalCredits += amount;
          else totalDebits += amount;
        }
        const totalTxns = rows.length;

        return json({
          account,
          transactions,
          stats: {
            total_txns: totalTxns,
            reconciled_txns: reconciledTxns,
            unreconciled_txns: totalTxns - reconciledTxns,
            total_credits: totalCredits,
            total_debits: totalDebits,
          },
        });
      },
      PUT: async ({ request, params }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const body = await safeJson(request);
        const row: Record<string, unknown> = {};
        if (body.name !== undefined) row.name = body.name;
        if (body.bankName !== undefined) row.bank_name = body.bankName;
        if (body.accountNumber !== undefined) row.account_number = body.accountNumber;
        if (body.accountType !== undefined) row.account_type = body.accountType;
        if (body.currency !== undefined) row.currency = body.currency;
        if (body.notes !== undefined) row.notes = body.notes || null;
        if (body.isActive !== undefined) row.is_active = body.isActive;
        const { data, error } = await sb
          .from("bank_accounts")
          .update(row as never)
          .eq("user_id", user.id)
          .eq("id", params.id)
          .select("*")
          .single();
        if (error) return errorJson(500, error.message);
        return json(data);
      },
      DELETE: generic.DELETE,
    },
  },
});
