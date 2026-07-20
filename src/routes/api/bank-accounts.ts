import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireUser, safeJson, sb } from "./_resource-helpers";
import { bankAccountStatsMap } from "./-bank-helpers";

// bank-reconciliation.tsx reads snake_case fields (bank_name, current_balance, ...)
// directly off these rows, so responses here are raw DB rows plus computed stats --
// not run through the generic camelCase rowToApi() conversion.
export const Route = createFileRoute("/api/bank-accounts")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const { data, error } = await sb
          .from("bank_accounts")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });
        if (error) return errorJson(500, error.message);
        const accounts = data ?? [];
        const statsMap = await bankAccountStatsMap(
          user.id,
          accounts.map((a: any) => a.id),
        );
        const rows = accounts.map((a: any) => {
          const s = statsMap.get(a.id) ?? {
            txn_count: 0,
            unreconciled_count: 0,
            total_credits: 0,
            total_debits: 0,
          };
          return { ...a, ...s };
        });
        return json({ data: rows, total: rows.length, page: 1, limit: rows.length || 1 });
      },
      POST: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const body = await safeJson(request);
        if (!body?.name) return errorJson(400, "name is required");
        if (!body?.bankName) return errorJson(400, "bankName is required");
        if (!body?.accountNumber) return errorJson(400, "accountNumber is required");
        const openingBalance = Number(body.openingBalance ?? 0);
        const row = {
          user_id: user.id,
          name: body.name,
          bank_name: body.bankName,
          account_number: body.accountNumber,
          account_type: body.accountType || "current",
          currency: body.currency || "GHS",
          opening_balance: openingBalance,
          current_balance: openingBalance,
          is_active: true,
          notes: body.notes || null,
        };
        const { data, error } = await sb
          .from("bank_accounts")
          .insert(row as never)
          .select("*")
          .single();
        if (error) return errorJson(500, error.message);
        return json({
          ...data,
          txn_count: 0,
          unreconciled_count: 0,
          total_credits: 0,
          total_debits: 0,
        });
      },
    },
  },
});
