/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { actorFromUser, recordAudit } from "./_audit";
import { errorJson, json, rowToApi, safeJson, sb } from "./_resource-helpers";
import { money, requireReturnPermission } from "./-purchase-return-helpers";

const types = [
  "reduce_supplier_balance",
  "cash_refund",
  "bank_refund",
  "mobile_money_refund",
  "supplier_credit",
  "replacement_goods",
  "no_immediate_settlement",
];
export const Route = createFileRoute("/api/purchase-returns/$id/settlements")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireReturnPermission(request, "view");
        if (auth.response) return auth.response;
        const { data, error } = await (sb as any)
          .from("purchase_return_settlements")
          .select("*")
          .eq("purchase_return_id", params.id)
          .order("created_at");
        if (error) return errorJson(500, error.message);
        return json({ data: (data ?? []).map(rowToApi) });
      },
      POST: async ({ request, params }) => {
        const auth = await requireReturnPermission(request, "settle", false);
        if (auth.response) return auth.response;
        const body = await safeJson(request);
        const settlements = Array.isArray(body.settlements) ? body.settlements : [body];
        const { data: ret } = await (sb as any)
          .from("purchase_returns")
          .select("*")
          .eq("id", params.id)
          .maybeSingle();
        if (!ret || ret.status !== "completed")
          return errorJson(409, "Only completed returns can be settled");
        const existing = money(ret.refunded_amount) + money(ret.credited_amount);
        const amount = money(settlements.reduce((sum: number, s: any) => sum + money(s.amount), 0));
        if (amount <= 0 || money(existing + amount) > money(ret.total_amount))
          return errorJson(400, "Settlement amount cannot exceed the return value");
        for (const s of settlements)
          if (!types.includes(s.settlementType)) return errorJson(400, "Invalid settlement type");
        const rows = settlements.map((s: any) => ({
          purchase_return_id: params.id,
          settlement_type: s.settlementType,
          amount: money(s.amount),
          payment_method: s.paymentMethod ?? null,
          account_id: s.accountId ?? null,
          transaction_reference: s.transactionReference ?? null,
          settlement_date: s.settlementDate ?? new Date().toISOString().slice(0, 10),
          notes: s.notes ?? null,
          created_by: auth.user.id,
        }));
        const { data, error } = await (sb as any)
          .from("purchase_return_settlements")
          .insert(rows)
          .select("*");
        if (error) return errorJson(500, error.message);
        const refunds = rows
          .filter((r: any) =>
            [
              "cash_refund",
              "bank_refund",
              "mobile_money_refund",
              "reduce_supplier_balance",
            ].includes(r.settlement_type),
          )
          .reduce((s: number, r: any) => s + r.amount, 0);
        const credits = rows
          .filter((r: any) => ["supplier_credit", "replacement_goods"].includes(r.settlement_type))
          .reduce((s: number, r: any) => s + r.amount, 0);
        await (sb as any)
          .from("purchase_returns")
          .update({
            refunded_amount: money(ret.refunded_amount + refunds),
            credited_amount: money(ret.credited_amount + credits),
            outstanding_amount: money(ret.total_amount - existing - amount),
          })
          .eq("id", params.id);
        const actor = await actorFromUser(auth.user);
        await recordAudit({
          ...actor,
          action: "purchase_return.settle",
          entityType: "purchase_return",
          entityId: params.id,
          entityName: ret.return_number,
          details: { amount, settlements: rows.map((r: any) => r.settlement_type) },
        });
        return json({ data: (data ?? []).map(rowToApi) }, { status: 201 });
      },
    },
  },
});
