/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import {
  apiToRow,
  errorJson,
  json,
  parseQuery,
  requireUser,
  rowToApi,
  safeJson,
  sb,
} from "./_resource-helpers";
import { notify } from "./_notify";
import { customerUuid, resolveCustomer, type CustomerRow } from "./-customer-credit-helpers";
import {
  adjustProductStock,
  numberOrZero,
  recordStockMovement,
  resolveBranchUuid,
  resolveWarehouseUuid,
  warehouseBalance,
} from "./-stock-helpers";
import { normalizeSaleBody, normalizeSaleItems } from "./-sales-helpers";

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

async function customerNameMap(userId: string, customerIds: string[]) {
  const ids = Array.from(new Set(customerIds.filter(Boolean)));
  const names = new Map<string, string>();
  if (!ids.length) return names;
  const { data } = await (sb as any)
    .from("customers")
    .select("id,uuid_id,name")
    .eq("user_id", userId)
    .in("uuid_id", ids);
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

async function decrementProductStock(userId: string, saleId: string, body: Record<string, any>) {
  if ((body.status ?? "completed") !== "completed") return null;
  const warehouseId = (body.warehouseId ?? body.warehouse_id ?? null) as string | null;

  for (const item of normalizeSaleItems(body.items)) {
    const productId = item.productId ?? item.product_id;
    const quantity = numberOrZero(item.quantity ?? item.qty);
    if (!productId || quantity <= 0) continue;

    const stockError = await adjustProductStock(String(productId), -quantity);
    if (stockError) return stockError;

    if (warehouseId) {
      const movement = await recordStockMovement({
        userId,
        productId: String(productId),
        warehouseId,
        movementType: "sale",
        quantity: -quantity,
        unitCost: numberOrZero((item as Record<string, unknown>).cost),
        referenceType: "sale",
        referenceId: saleId,
        reason: "Sale completed",
        createdBy: userId,
      });
      if (movement.error) return movement.error;
    }
  }
  return null;
}

async function updateCustomerSpend(userId: string, customerId: string | null, total: number) {
  if (!customerId || total <= 0) return null;
  const { data: customer, error } = await (sb as any)
    .from("customers")
    .select("id,total_spend")
    .eq("user_id", userId)
    .eq("uuid_id", customerId)
    .maybeSingle();
  if (error) return error.message;
  if (!customer) return null;
  const { error: updateError } = await (sb as any)
    .from("customers")
    .update({ total_spend: numberOrZero(customer.total_spend) + total })
    .eq("id", customer.id);
  return updateError?.message ?? null;
}

function creditChargeAmount(body: Record<string, any>) {
  const method = String(body.paymentMethod ?? body.payment_method ?? "").toLowerCase();
  const status = String(body.paymentStatus ?? body.payment_status ?? "").toLowerCase();
  const total = numberOrZero(body.total);
  const paid = numberOrZero(body.paid);
  if (method.includes("credit") || method.includes("account"))
    return paid > 0 ? Math.max(total - paid, 0) : total;
  if (status === "credit" || status === "unpaid" || status === "partial")
    return Math.max(total - paid, 0);
  return 0;
}

async function recordCustomerReceivable(userId: string, sale: SaleRow, body: Record<string, any>) {
  const customerId = (sale.customer_id ?? null) as string | null;
  if (!customerId) return null;
  const amount = creditChargeAmount(body);
  if (amount <= 0) return null;
  const { error } = await (sb as any).from("customer_credits").insert({
    user_id: userId,
    customer_id: customerId,
    type: "charge",
    amount,
    reference: sale.reference ?? sale.id,
    notes: `Sale ${sale.reference ?? sale.id}`,
  });
  return error?.message ?? null;
}

export const Route = createFileRoute("/api/sales")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const { limit, page, offset, search, params } = parseQuery(request);
        let q = sb
          .from("sales")
          .select("*", { count: "exact" })
          .eq("user_id", user.id)
          .order("sold_at", { ascending: false })
          .range(offset, offset + limit - 1);
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
          user.id,
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
          user_id: user.id,
          reference: body.reference ?? body.invoiceNumber ?? makeReference(),
        };
        const { data, error } = await sb
          .from("sales")
          .insert(row as never)
          .select("*")
          .single();
        if (error) return errorJson(500, error.message);

        const sale = data as SaleRow;
        const stockError = await decrementProductStock(user.id, sale.id, body);
        if (stockError) return errorJson(500, stockError);

        const total = numberOrZero(sale.total);
        const spendError =
          (sale.status ?? "completed") === "completed"
            ? await updateCustomerSpend(user.id, sale.customer_id ?? null, total)
            : null;
        if (spendError) return errorJson(500, spendError);

        const creditError = await recordCustomerReceivable(user.id, sale, body);
        if (creditError) return errorJson(500, creditError);

        await notify({
          userId: user.id,
          type: "sale",
          severity: "success",
          title: "Sale created",
          message: `Sale ${sale.reference ?? sale.id} - ${sale.total ?? ""}`,
          link: "/sales",
          metadata: { id: sale.id, action: "create" },
        });

        const names = await customerNameMap(
          user.id,
          sale.customer_id ? [String(sale.customer_id)] : [],
        );
        return json(toSaleApi(sale, names));
      },
    },
  },
});
