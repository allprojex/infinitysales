/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import {
  apiToRow,
  errorJson,
  json,
  loadResourceScope,
  parseQuery,
  requireUser,
  rowToApi,
  safeJson,
  sb,
} from "./_resource-helpers";
import { notify } from "./_notify";
import { customerUuid, resolveCustomer, type CustomerRow } from "./-customer-credit-helpers";
import {
  numberOrZero,
  resolveBranchUuid,
  resolveWarehouseUuid,
  warehouseBalance,
} from "./-stock-helpers";
import { creditChargeAmount, normalizeSaleBody, normalizeSaleItems } from "./-sales-helpers";

type SaleRow = Record<string, any> & { customer_id?: string | null };

const makeReference = () => {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .slice(0, 14);
  return `INV-${stamp}`;
};

async function snapshotItemCategories(items: unknown) {
  const rows = Array.isArray(items) ? (items as Record<string, unknown>[]) : [];
  const ids = Array.from(
    new Set(rows.map((item) => String(item.productId ?? item.product_id ?? "")).filter(Boolean)),
  );
  if (!ids.length) return rows;
  const { data } = await sb
    .from("products")
    .select("id,category_id,product_categories!products_category_id_fkey(name)")
    .in("id", ids);
  const categories = new Map(
    (data ?? []).map((product) => [
      String(product.id),
      { id: product.category_id, name: product.product_categories?.name ?? "Other" },
    ]),
  );
  return rows.map((item) => {
    const category = categories.get(String(item.productId ?? item.product_id ?? ""));
    return category ? { ...item, categoryId: category.id, categoryName: category.name } : item;
  });
}

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

async function ensureStockAvailable(userId: string, body: Record<string, any>) {
  if ((body.status ?? "completed") !== "completed") return null;
  const warehouseId = (body.warehouseId ?? body.warehouse_id ?? null) as string | null;
  const items = normalizeSaleItems(body.items);
  for (const item of items) {
    const productId = item.productId ?? item.product_id;
    const quantity = numberOrZero(item.quantity ?? item.qty);
    if (!productId || quantity <= 0 || !warehouseId) continue;
    const current = await warehouseBalance(userId, String(productId), warehouseId);
    if (current.error) return current.error;
    if (current.balance < quantity) return "Insufficient stock in sale warehouse";
  }
  return null;
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
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const rawBody = await safeJson(request);
        const normalized = await normalizeSaleBody(user.id, rawBody);
        if (normalized.error) return errorJson(400, normalized.error);
        const body = normalized.body;
        body.items = await snapshotItemCategories(body.items);
        const stockValidationError = await ensureStockAvailable(user.id, body);
        if (stockValidationError) return errorJson(400, stockValidationError);

        const row = {
          ...apiToRow(body),
          reference: body.reference ?? body.invoiceNumber ?? makeReference(),
        };
        // Sale insert, stock decrement, customer spend and customer
        // receivable all happen in one Postgres transaction (ISSUE-008 —
        // see supabase/migrations/20260720150605_create_sale_atomic.sql).
        // A failure partway through now rolls back everything instead of
        // leaving a "completed" sale with some effects silently missing.
        const { data, error } = await (sb as any).rpc("create_sale_atomic", {
          p_user_id: user.id,
          p_sale: row,
          p_credit_amount: creditChargeAmount(body),
        });
        if (error) return errorJson(500, error.message);

        const sale = data as SaleRow;

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
