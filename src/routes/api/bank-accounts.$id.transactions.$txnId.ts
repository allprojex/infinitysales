import { createFileRoute } from "@tanstack/react-router";
import { sb, requireUser, json, apiToRow, rowToApi } from "./_resource-helpers";
import { adjustAccountBalance, txnDelta } from "./-bank-helpers";

export const Route = createFileRoute("/api/bank-accounts/$id/transactions/$txnId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireUser(request);
        if (auth.response) return auth.response;
        const { data, error } = await sb
          .from("bank_transactions")
          .select("*")
          .eq("user_id", auth.user.id)
          .eq("bank_account_id", params.id)
          .eq("id", params.txnId)
          .maybeSingle();
        if (error) return json({ message: error.message }, { status: 500 });
        if (!data) return json({ message: "Not found" }, { status: 404 });
        return json(rowToApi(data));
      },
      PATCH: async ({ request, params }) => {
        const auth = await requireUser(request);
        if (auth.response) return auth.response;
        const body = await request.json().catch(() => ({}));
        const { data, error } = await sb
          .from("bank_transactions")
          .update(apiToRow(body) as any)
          .eq("user_id", auth.user.id)
          .eq("id", params.txnId)
          .select("*")
          .single();
        if (error) return json({ message: error.message }, { status: 500 });
        return json(rowToApi(data));
      },
      DELETE: async ({ request, params }) => {
        const auth = await requireUser(request);
        if (auth.response) return auth.response;
        const { data: txn, error: fetchError } = await sb
          .from("bank_transactions")
          .select("amount, type, bank_account_id")
          .eq("user_id", auth.user.id)
          .eq("id", params.txnId)
          .maybeSingle();
        if (fetchError) return json({ message: fetchError.message }, { status: 500 });
        if (!txn) return json({ message: "Not found" }, { status: 404 });
        const { error } = await sb
          .from("bank_transactions")
          .delete()
          .eq("user_id", auth.user.id)
          .eq("id", params.txnId);
        if (error) return json({ message: error.message }, { status: 500 });
        const { error: balError } = await adjustAccountBalance(
          auth.user.id,
          (txn as any).bank_account_id,
          -txnDelta((txn as any).type, Number((txn as any).amount)),
        );
        if (balError) return json({ message: balError }, { status: 500 });
        return json({ ok: true });
      },
    },
  },
});
