import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, profileNameMap, requireUser, sb } from "./_resource-helpers";
import { adjustAccountBalance, txnDelta, withBalanceAfter } from "./-bank-helpers";

export const Route = createFileRoute("/api/bank-accounts/$id/transactions")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireUser(request);
        if (auth.response) return auth.response;
        const { data: account } = await sb
          .from("bank_accounts")
          .select("opening_balance")
          .eq("user_id", auth.user.id)
          .eq("id", params.id)
          .maybeSingle();
        const { data, error, count } = await sb
          .from("bank_transactions")
          .select("*", { count: "exact" })
          .eq("user_id", auth.user.id)
          .eq("bank_account_id", params.id)
          .order("occurred_at", { ascending: true })
          .order("created_at", { ascending: true });
        if (error) return json({ message: error.message }, { status: 500 });
        const rows = data ?? [];
        const nameMap = await profileNameMap(rows.map((t: any) => t.user_id));
        const withBalances = withBalanceAfter(Number((account as any)?.opening_balance ?? 0), rows);
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
        return json({ data: transactions, total: count ?? transactions.length });
      },
      POST: async ({ request, params }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const body = await request.json().catch(() => ({}));
        if (!body?.description) return errorJson(400, "description is required");
        if (body?.amount == null || body?.amount === "")
          return errorJson(400, "amount is required");
        const type = body.type === "credit" ? "credit" : "debit";
        const amount = Number(body.amount);
        const row = {
          user_id: user.id,
          bank_account_id: params.id,
          occurred_at: body.txnDate ? `${body.txnDate}T00:00:00.000Z` : new Date().toISOString(),
          description: body.description,
          reference: body.reference || null,
          amount,
          type,
          reconciled: false,
          notes: body.notes || null,
        };
        const { data, error } = await sb
          .from("bank_transactions")
          .insert(row as never)
          .select("*")
          .single();
        if (error) return errorJson(500, error.message);
        const { error: balError } = await adjustAccountBalance(
          user.id,
          params.id,
          txnDelta(type, amount),
        );
        if (balError) return errorJson(500, balError);
        return json(data);
      },
    },
  },
});
