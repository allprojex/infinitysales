/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { actorFromUser, recordAudit } from "./_audit";
import {
  errorJson,
  json,
  loadResourceScope,
  parseQuery,
  rowToApi,
  safeJson,
  sb,
} from "./_resource-helpers";
import { notify } from "./_notify";
import {
  money,
  normalizeReturnItems,
  requireReturnPermission,
  returnableItems,
  validateReturnItems,
} from "./-purchase-return-helpers";

const expanded = "*,purchase_return_items(*),purchase_return_settlements(*)";

export const Route = createFileRoute("/api/purchase-returns")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireReturnPermission(request, "view");
        if (auth.response) return auth.response;
        const scope = await loadResourceScope(auth.user.id);
        if (scope.error) return errorJson(500, scope.error);
        const { limit, page, offset, search, params } = parseQuery(request);
        let q = (sb as any)
          .from("purchase_returns")
          .select(expanded, { count: "exact" })
          .order("returned_at", { ascending: false })
          .range(offset, offset + limit - 1);
        if (!scope.isPrivileged) q = q.eq("user_id", auth.user.id);
        if (search)
          q = q.or(
            `return_number.ilike.%${search}%,reference.ilike.%${search}%,reason_summary.ilike.%${search}%,supplier_reference.ilike.%${search}%`,
          );
        for (const key of [
          "status",
          "settlementType",
          "supplierId",
          "warehouseId",
          "purchaseOrderId",
        ]) {
          const value = params.get(key);
          if (value && value !== "all")
            q = q.eq(
              key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`),
              value,
            );
        }
        const from = params.get("from");
        const to = params.get("to");
        if (from) q = q.gte("returned_at", from);
        if (to) q = q.lte("returned_at", `${to}T23:59:59.999Z`);
        const { data, error, count } = await q;
        if (error) return errorJson(500, error.message);
        const rows = (data ?? []).map((row: Record<string, unknown>) => ({
          ...rowToApi(row),
          itemCount: Array.isArray(row.purchase_return_items)
            ? row.purchase_return_items.length
            : 0,
        }));
        const summary = rows.reduce(
          (s: Record<string, number>, row: any) => {
            s.total += 1;
            s.value += money(row.totalAmount);
            s[row.status] = (s[row.status] ?? 0) + 1;
            s.refunded += money(row.refundedAmount);
            s.outstanding += money(row.outstandingAmount);
            return s;
          },
          {
            total: 0,
            value: 0,
            refunded: 0,
            outstanding: 0,
            draft: 0,
            pending_approval: 0,
            completed: 0,
          },
        );
        return json({ data: rows, total: count ?? rows.length, page, limit, summary });
      },
      POST: async ({ request }) => {
        const auth = await requireReturnPermission(request, "create");
        if (auth.response) return auth.response;
        const body = await safeJson(request);
        const purchaseOrderId = String(body.purchaseOrderId ?? "");
        if (!purchaseOrderId) return errorJson(400, "Select an eligible purchase");
        const input = normalizeReturnItems(body.items);
        const validation = validateReturnItems(input);
        if (validation) return errorJson(400, validation);
        const eligible = await returnableItems(purchaseOrderId, auth.user.id);
        if (eligible.error || !eligible.order)
          return errorJson(400, eligible.error ?? "Purchase not found");
        const byId = new Map(eligible.items.map((item) => [item.productId, item]));
        const rows = [] as Array<Record<string, unknown>>;
        let subtotal = 0;
        for (const item of input) {
          const source = byId.get(item.productId);
          if (!source) return errorJson(400, "A selected product is not part of this purchase");
          if (item.quantityReturned > source.quantityReturnable)
            return errorJson(
              409,
              `Return quantity cannot exceed ${source.quantityReturnable} units for ${source.productName}.`,
            );
          const lineTotal = money(item.quantityReturned * source.unitCost);
          subtotal = money(subtotal + lineTotal);
          rows.push({
            product_id: item.productId,
            warehouse_id: body.warehouseId ?? eligible.order.warehouse_id,
            product_name: source.productName,
            category_id: source.categoryId,
            category_name: source.categoryName,
            quantity_purchased: source.quantity,
            quantity_previously_returned: source.quantityPreviouslyReturned,
            quantity_returned: item.quantityReturned,
            unit_cost: source.unitCost,
            line_total: lineTotal,
            reason: item.reason,
            item_condition: item.condition,
            other_explanation: item.otherExplanation ?? null,
            notes: item.notes ?? null,
          });
        }
        const reference = await (sb as any).rpc("next_purchase_return_number");
        if (reference.error) return errorJson(500, reference.error.message);
        const returnNumber = String(reference.data);
        const status = body.submit ? "pending_approval" : "draft";
        const header = {
          user_id: eligible.order.user_id,
          created_by: auth.user.id,
          return_number: returnNumber,
          reference: returnNumber,
          purchase_order_id: purchaseOrderId,
          supplier_id: body.supplierId ?? null,
          warehouse_id: body.warehouseId ?? eligible.order.warehouse_id,
          returned_at: body.returnDate ?? new Date().toISOString(),
          status,
          settlement_type: body.settlementType ?? "no_immediate_settlement",
          reason_summary: body.reasonSummary ?? null,
          reason: body.reasonSummary ?? null,
          subtotal,
          total: subtotal,
          total_amount: subtotal,
          outstanding_amount: subtotal,
          notes: body.notes ?? null,
          debit_note_number: `DN-${returnNumber.slice(3)}`,
          submitted_by: status === "pending_approval" ? auth.user.id : null,
          submitted_at: status === "pending_approval" ? new Date().toISOString() : null,
        };
        const { data, error } = await (sb as any)
          .from("purchase_returns")
          .insert(header)
          .select("*")
          .single();
        if (error) return errorJson(500, error.message);
        const { error: itemError } = await (sb as any)
          .from("purchase_return_items")
          .insert(rows.map((row) => ({ ...row, purchase_return_id: data.id })));
        if (itemError) {
          await (sb as any).from("purchase_returns").delete().eq("id", data.id);
          return errorJson(500, itemError.message);
        }
        const actor = await actorFromUser(auth.user);
        await recordAudit({
          ...actor,
          action: status === "draft" ? "purchase_return.create_draft" : "purchase_return.submit",
          entityType: "purchase_return",
          entityId: data.id,
          entityName: returnNumber,
          details: { purchaseOrderId, total: subtotal },
        });
        await notify({
          userId: eligible.order.user_id,
          type: "purchase-return",
          severity: status === "draft" ? "info" : "warning",
          title:
            status === "draft"
              ? "Purchase return draft created"
              : "Purchase return approval required",
          message: returnNumber,
          link: "/purchase-returns",
          metadata: { id: data.id, action: status },
        });
        return json({ ...rowToApi(data), items: rows }, { status: 201 });
      },
    },
  },
});
