/* eslint-disable @typescript-eslint/no-explicit-any */
import { sb } from "./_resource-helpers";
import { customerUuid, resolveCustomer } from "./-customer-credit-helpers";
import { numberOrZero, normalizeLocationFields } from "./-stock-helpers";

type PromotionRow = {
  id: string;
  type?: string | null;
  value?: unknown;
  min_purchase?: unknown;
  starts_at?: string | null;
  ends_at?: string | null;
  is_active?: boolean | null;
  applies_to?: Record<string, unknown> | null;
};

type SaleItem = Record<string, unknown> & {
  productId?: string;
  product_id?: string;
  productName?: string;
  product_name?: string;
  category?: string;
  quantity?: unknown;
  qty?: unknown;
  price?: unknown;
  unitPrice?: unknown;
  unit_price?: unknown;
  total?: unknown;
};

const sameDayEnd = (value: string) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T23:59:59.999Z`);
  return new Date(value);
};

function normalizedType(value: unknown) {
  return String(value ?? "percentage")
    .toLowerCase()
    .replace(/[_ -]/g, "");
}

function itemProductId(item: SaleItem) {
  const id = item.productId ?? item.product_id;
  return id == null ? null : String(id);
}

function itemQuantity(item: SaleItem) {
  return numberOrZero(item.quantity ?? item.qty);
}

function itemUnitPrice(item: SaleItem) {
  return numberOrZero(item.unitPrice ?? item.unit_price ?? item.price);
}

export function normalizeSaleItems(items: unknown): SaleItem[] {
  if (!Array.isArray(items)) return [];
  return items.map((item) => {
    const row = { ...(item as SaleItem) };
    const productId = itemProductId(row);
    const quantity = itemQuantity(row);
    const unitPrice = itemUnitPrice(row);
    if (productId) {
      row.productId = productId;
      row.product_id = productId;
    }
    row.quantity = quantity;
    row.unitPrice = unitPrice;
    row.price = unitPrice;
    row.total = +numberOrZero(row.total ?? quantity * unitPrice).toFixed(2);
    return row;
  });
}

export function saleSubtotal(items: SaleItem[]) {
  return +items.reduce((sum, item) => sum + numberOrZero(item.total), 0).toFixed(2);
}

// How much of a sale becomes a customer_credits "charge" — pre-computed here
// and handed to create_sale_atomic() (20260720150605_create_sale_atomic.sql)
// as a plain number, since it's a pure function of already-known values and
// there's no reason to re-derive it in SQL.
export function creditChargeAmount(body: Record<string, any>) {
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

function isPromotionActive(row: PromotionRow, now: Date) {
  if (row.is_active === false) return false;
  const meta = row.applies_to ?? {};
  const status = String(meta.status ?? "active").toLowerCase();
  if (status !== "active") return false;
  if (row.starts_at && new Date(row.starts_at) > now) return false;
  if (row.ends_at && sameDayEnd(row.ends_at) < now) return false;
  return true;
}

function promotionLineDiscount(row: PromotionRow, item: SaleItem) {
  const meta = row.applies_to ?? {};
  const scope = String(meta.scope ?? "all").toLowerCase();
  const productId = itemProductId(item);
  const targetProductIds = Array.isArray(meta.targetProductIds)
    ? meta.targetProductIds.map(String)
    : [];

  if (scope === "product" || scope === "products" || targetProductIds.length) {
    if (!productId || !targetProductIds.includes(productId)) return 0;
  }
  if (scope === "category" && meta.targetCategory) {
    if (String(item.category ?? "").toLowerCase() !== String(meta.targetCategory).toLowerCase())
      return 0;
  }

  const quantity = itemQuantity(item);
  const lineTotal = numberOrZero(item.total);
  const minQuantity = Number(meta.buyQuantity ?? 0) || 0;
  if (minQuantity > 0 && quantity < minQuantity) return 0;
  const minPurchase = numberOrZero(row.min_purchase);
  if (!minQuantity && minPurchase > 0 && lineTotal < minPurchase) return 0;

  const value = numberOrZero(row.value);
  const type = normalizedType(row.type);
  if (type === "percentage" || type === "percent" || type === "%off") {
    return lineTotal * (value / 100);
  }
  if (type === "fixed" || type === "fixedamount" || type === "amount") {
    return Math.min(value, lineTotal);
  }
  return 0;
}

export function calculatePromotionDiscount(
  promotions: PromotionRow[],
  items: SaleItem[],
  now = new Date(),
) {
  let bestDiscount = 0;
  for (const promotion of promotions) {
    if (!isPromotionActive(promotion, now)) continue;
    const discount = items.reduce((sum, item) => sum + promotionLineDiscount(promotion, item), 0);
    bestDiscount = Math.max(bestDiscount, discount);
  }
  return +bestDiscount.toFixed(2);
}

export async function loadActivePromotions(userId: string) {
  const { data, error } = await (sb as any)
    .from("promotions")
    .select("id,type,value,min_purchase,starts_at,ends_at,is_active,applies_to")
    .eq("user_id", userId)
    .eq("is_active", true);
  return { promotions: (data ?? []) as PromotionRow[], error: error?.message ?? null };
}

export async function normalizeSaleBody(userId: string, body: Record<string, any>) {
  const location = await normalizeLocationFields(userId, body);
  if (location.error) return { body, error: location.error };
  const normalized = { ...location.row };

  const customerRaw = normalized.customerId ?? normalized.customer_id;
  if (customerRaw != null && customerRaw !== "") {
    const resolved = await resolveCustomer(userId, String(customerRaw));
    if (resolved.error) return { body, error: resolved.error };
    normalized.customerId = customerUuid(resolved.customer!);
    normalized.customer_id = customerUuid(resolved.customer!);
  }

  const items = normalizeSaleItems(normalized.items);
  normalized.items = items;
  const subtotal = numberOrZero(normalized.subtotal) || saleSubtotal(items);
  normalized.subtotal = +subtotal.toFixed(2);

  const { promotions, error } = await loadActivePromotions(userId);
  if (error) return { body, error };

  const promoDiscount = calculatePromotionDiscount(
    promotions,
    items,
    normalized.soldAt ? new Date(normalized.soldAt) : new Date(),
  );
  const providedDiscount = numberOrZero(normalized.discount);
  const finalDiscount = Math.max(providedDiscount, promoDiscount);
  const tax = numberOrZero(normalized.tax);
  const originalTotal = numberOrZero(normalized.total) || subtotal + tax - providedDiscount;
  const finalTotal = Math.max(subtotal + tax - finalDiscount, 0);
  normalized.discount = +finalDiscount.toFixed(2);
  normalized.total = +finalTotal.toFixed(2);

  const paid =
    normalized.paid == null || normalized.paid === "" ? null : numberOrZero(normalized.paid);
  if (paid != null && Math.abs(paid - originalTotal) < 0.01) {
    // The customer paid the client-computed total in full. If the server
    // discovered a bigger discount than the client knew about (a
    // promotion, most commonly -- see calculatePromotionDiscount above),
    // the true total is lower: correct paid to match it, and shift the
    // same delta onto changeDue rather than zeroing it outright, so
    // paid + changeDue still equals whatever cash was actually tendered.
    // Previously this always zeroed changeDue, discarding the real record
    // of change handed back at the register on every POS cash sale --
    // promotion or not, since paid is always sent equal to the client's
    // own total -- because delta was implicitly assumed to always be 0.
    const delta = originalTotal - finalTotal;
    const existingChangeDue = numberOrZero(normalized.changeDue);
    normalized.paid = +finalTotal.toFixed(2);
    normalized.changeDue = +(existingChangeDue + delta).toFixed(2);
  }

  return {
    body: normalized,
    error: null as string | null,
    promotionDiscount: promoDiscount,
  };
}
