/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import {
  errorJson,
  json,
  loadResourceScope,
  parseQuery,
  profileNameMap,
  rowToApi,
  safeJson,
  sb,
} from "./_resource-helpers";
import { notify } from "./_notify";
import {
  customerNameMap,
  money,
  normalizeReturnLines,
  REFUND_METHODS,
  requireSalesReturnPermission,
  saleReferenceMap,
  validateReturnLines,
} from "./-sale-return-helpers";

export const Route = createFileRoute("/api/sales-returns")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireSalesReturnPermission(request, "view");
        if (auth.response) return auth.response;
        const scope = await loadResourceScope(auth.user.id);
        if (scope.error) return errorJson(500, scope.error);
        const { limit, page, offset, search, params } = parseQuery(request);

        let saleIdFilter: string[] | null = null;
        const originalInvoice = params.get("originalInvoice");
        if (originalInvoice) {
          const { data: matches } = await (sb as any)
            .from("sales")
            .select("id")
            .ilike("reference", `%${originalInvoice}%`);
          saleIdFilter = (matches ?? []).map((m: any) => String(m.id)) as string[];
          if (!saleIdFilter.length)
            return json({ data: [], total: 0, page, limit, summary: emptySummary() });
        }

        let customerIdFilter: string[] | null = null;
        const customerTerm = params.get("customer");
        if (customerTerm) {
          const { data: matches } = await (sb as any)
            .from("customers")
            .select("uuid_id")
            .ilike("name", `%${customerTerm}%`);
          customerIdFilter = (matches ?? []).map((m: any) => String(m.uuid_id)) as string[];
          if (!customerIdFilter.length)
            return json({ data: [], total: 0, page, limit, summary: emptySummary() });
        }

        let q = (sb as any)
          .from("sale_returns")
          .select("*, sale_return_lines(quantity_returned)", { count: "exact" })
          .order("returned_at", { ascending: false })
          .range(offset, offset + limit - 1);
        if (!scope.isPrivileged) q = q.eq("user_id", auth.user.id);
        if (search) q = q.or(`return_number.ilike.%${search}%,reason.ilike.%${search}%`);
        if (saleIdFilter) q = q.in("sale_id", saleIdFilter);
        if (customerIdFilter) q = q.in("customer_id", customerIdFilter);
        const status = params.get("status");
        if (status && status !== "all") q = q.eq("status", status);
        const warehouseId = params.get("warehouseId");
        if (warehouseId && warehouseId !== "all") q = q.eq("warehouse_id", warehouseId);
        const from = params.get("from");
        const to = params.get("to");
        if (from) q = q.gte("returned_at", from);
        if (to) q = q.lte("returned_at", `${to}T23:59:59.999Z`);

        const { data, error, count } = await q;
        if (error) return errorJson(500, error.message);
        const rows = data ?? [];
        const names = await customerNameMap(rows.map((r: any) => String(r.customer_id ?? "")));
        const refs = await saleReferenceMap(rows.map((r: any) => String(r.sale_id ?? "")));
        const creators = await profileNameMap(rows.map((r: any) => r.created_by));
        const formatted = rows.map((row: any) => ({
          ...rowToApi(row),
          customerName: row.customer_id ? (names.get(String(row.customer_id)) ?? null) : "Walk-in",
          originalInvoice: refs.get(String(row.sale_id)) ?? row.sale_id,
          createdByName: creators.get(String(row.created_by)) ?? "Unknown",
          itemCount: Array.isArray(row.sale_return_lines)
            ? row.sale_return_lines.reduce(
                (s: number, l: any) => s + Number(l.quantity_returned ?? 0),
                0,
              )
            : 0,
        }));
        const summary = formatted.reduce((s: Record<string, number>, row: any) => {
          s.total += 1;
          if (row.status === "completed") {
            s.completed += 1;
            s.refunded = money(s.refunded + Number(row.refundAmount ?? 0));
            s.itemsReturned += row.itemCount;
          }
          if (row.status === "pending") s.pending += 1;
          return s;
        }, emptySummary());
        return json({ data: formatted, total: count ?? formatted.length, page, limit, summary });
      },
      POST: async ({ request }) => {
        const auth = await requireSalesReturnPermission(request, "create");
        if (auth.response) return auth.response;
        const body = await safeJson(request);
        const saleId = String(body.saleId ?? "");
        if (!saleId) return errorJson(400, "Select a completed sale to return against");
        const refundMethod = String(body.refundMethod ?? "");
        if (!(REFUND_METHODS as readonly string[]).includes(refundMethod))
          return errorJson(400, "Select a valid refund method");
        const lines = normalizeReturnLines(body.lines);
        const validation = validateReturnLines(lines);
        if (validation) return errorJson(400, validation);

        const { data, error } = await (sb as any).rpc("create_sale_return_atomic", {
          p_actor: auth.user.id,
          p_sale_id: saleId,
          p_lines: lines.map((l) => ({
            saleLineId: l.saleLineId,
            quantityReturned: l.quantityReturned,
            reason: l.reason ?? null,
            condition: l.condition ?? null,
          })),
          p_refund_method: refundMethod,
          p_reason: body.reason ?? null,
          p_notes: body.notes ?? null,
        });
        if (error) {
          const status = /exceed|not eligible|not found|does not belong/i.test(error.message)
            ? 400
            : 500;
          return errorJson(status, error.message);
        }

        await notify({
          userId: data.user_id,
          type: "sale-return",
          severity: "success",
          title: "Sales return recorded",
          message: `${data.return_number} - ${money(data.refund_amount)}`,
          link: "/sales-returns",
          metadata: { id: data.id, action: "create" },
        });

        return json(rowToApi(data), { status: 201 });
      },
    },
  },
});

function emptySummary() {
  return { total: 0, pending: 0, completed: 0, refunded: 0, itemsReturned: 0 };
}
