import { createFileRoute } from "@tanstack/react-router";
import {
  errorJson,
  json,
  loadResourceScope,
  parseQuery,
  requireAnyPermission,
  requireUser,
  rowToApi,
  safeJson,
  sb,
} from "./_resource-helpers";
import { notify } from "./_notify";
import { customerUuid, resolveCustomer, type CustomerRow } from "./-customer-credit-helpers";
import { resolveBranchUuid, resolveWarehouseUuid } from "./-stock-helpers";
import { createSaleThroughEngine } from "./-sale-engine";

type SaleRow = Record<string, any> & { customer_id?: string | null };

// Customers are a shared business directory (see customers.ts) -- a sale's
// customer may have been created by a different account than the one
// viewing the sales list, so this must not filter by the viewer's user_id.
async function customerNameMap(customerIds: string[]) {
  const ids = Array.from(new Set(customerIds.filter(Boolean)));
  const names = new Map<string, string>();
  if (!ids.length) return names;
  const { data } = await (sb as any).from("customers").select("id,uuid_id,name").in("uuid_id", ids);
  for (const customer of data ?? []) {
    names.set(String(customer.uuid_id ?? customer.id), customer.name);
  }
  return names;
}

function toSaleApi(row: SaleRow, names = new Map<string, string>()) {
  const api = rowToApi(row);
  return {
    ...api,
    invoiceNumber: row.reference ?? row.id,
    saleDate: row.sold_at,
    customerName: row.customer_id ? (names.get(String(row.customer_id)) ?? null) : "Walk-in",
  };
}

export const Route = createFileRoute("/api/sales")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const scope = await loadResourceScope(user.id);
        if (scope.error) return errorJson(500, scope.error);
        const { limit, page, offset, search, params } = parseQuery(request);
        let q = sb
          .from("sales")
          .select("*", { count: "exact" })
          .order("sold_at", { ascending: false })
          .range(offset, offset + limit - 1);
        if (!scope.isPrivileged) q = q.eq("user_id", user.id);
        if (search) q = q.or(`reference.ilike.%${search}%,notes.ilike.%${search}%`);
        for (const f of ["channel", "status", "paymentStatus"]) {
          const v = params.get(f);
          if (v != null && v !== "") {
            const col = f.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
            q = q.eq(col, v);
          }
        }
        const branchId = params.get("branchId");
        if (branchId) {
          const resolved = await resolveBranchUuid(user.id, branchId);
          if (resolved.error) return errorJson(404, resolved.error);
          q = q.eq("branch_id", resolved.branchId as never);
        }
        const warehouseId = params.get("warehouseId");
        if (warehouseId) {
          const resolved = await resolveWarehouseUuid(user.id, warehouseId);
          if (resolved.error) return errorJson(404, resolved.error);
          q = q.eq("warehouse_id", resolved.warehouseId as never);
        }
        const customerId = params.get("customerId");
        if (customerId) {
          const resolved = await resolveCustomer(user.id, customerId);
          if (resolved.error) return errorJson(404, resolved.error);
          q = q.eq("customer_id", customerUuid(resolved.customer as CustomerRow));
        }

        const { data, error, count } = await q;
        if (error) return errorJson(500, error.message);
        const rows = (data ?? []) as SaleRow[];
        const names = await customerNameMap(
          rows.map((row) => String(row.customer_id ?? "")).filter(Boolean),
        );
        return json({
          data: rows.map((row) => toSaleApi(row, names)),
          total: count ?? rows.length,
          page,
          limit,
        });
      },
      POST: async ({ request }) => {
        // Reachable from both the Sales page (perm_user_sales) and the POS
        // terminal (perm_user_pos) client-side - previously requireUser alone
        // meant either UI gate could be bypassed entirely by calling this
        // endpoint directly. Admins always pass (see requireAnyPermission).
        const { user, response } = await requireAnyPermission(
          request,
          ["perm_user_sales", "perm_user_pos"],
          true,
        );
        if (!user) return response;
        const rawBody = await safeJson(request);
        const created = await createSaleThroughEngine(user.id, rawBody);
        if (created.error) return errorJson(400, created.error);
        // Header, canonical lines, compatibility snapshot, inventory,
        // customer spend, receivable, and audit event share one transaction.
        const sale = created.sale as SaleRow;

        await notify({
          userId: user.id,
          type: "sale",
          severity: "success",
          title: "Sale created",
          message: `Sale ${sale.reference ?? sale.id} - ${sale.total ?? ""}`,
          link: "/sales",
          metadata: { id: sale.id, action: "create" },
        });

        const names = await customerNameMap(sale.customer_id ? [String(sale.customer_id)] : []);
        return json(toSaleApi(sale, names));
      },
    },
  },
});
