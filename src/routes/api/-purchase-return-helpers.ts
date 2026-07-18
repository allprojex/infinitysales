/* eslint-disable @typescript-eslint/no-explicit-any */
import { errorJson, requireUser, sb } from "./_resource-helpers";
import { globalUserPermissions } from "./-permission-helpers";

export const RETURN_REASONS = [
  "Damaged",
  "Defective",
  "Expired",
  "Wrong item supplied",
  "Excess quantity",
  "Poor quality",
  "Supplier recall",
  "Order cancelled",
  "Other",
] as const;
export const ITEM_CONDITIONS = [
  "Unopened",
  "Opened",
  "Damaged",
  "Defective",
  "Expired",
  "Unsellable",
  "Other",
] as const;
export const RETURN_STATUSES = [
  "draft",
  "pending_approval",
  "approved",
  "completed",
  "cancelled",
  "reversed",
] as const;

export type ReturnItemInput = {
  productId: string;
  quantityReturned: number;
  reason: string;
  condition: string;
  notes?: string;
  otherExplanation?: string;
};

export function money(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

export function normalizeReturnItems(value: unknown): ReturnItemInput[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw: Record<string, unknown>) => ({
    productId: String(raw.productId ?? raw.product_id ?? ""),
    quantityReturned: Number(raw.quantityReturned ?? raw.quantity_returned ?? 0),
    reason: String(raw.reason ?? ""),
    condition: String(raw.condition ?? raw.itemCondition ?? raw.item_condition ?? ""),
    notes: raw.notes ? String(raw.notes) : undefined,
    otherExplanation: raw.otherExplanation ? String(raw.otherExplanation) : undefined,
  }));
}

export function validateReturnItems(items: ReturnItemInput[]) {
  if (!items.length) return "Select at least one product to return";
  const seen = new Set<string>();
  for (const item of items) {
    if (!item.productId || seen.has(item.productId)) return "Each returned product must be unique";
    seen.add(item.productId);
    if (!Number.isFinite(item.quantityReturned) || item.quantityReturned <= 0)
      return "Return quantity must be greater than zero";
    if (!(RETURN_REASONS as readonly string[]).includes(item.reason))
      return "Select a return reason";
    if (!(ITEM_CONDITIONS as readonly string[]).includes(item.condition))
      return "Select an item condition";
    if ((item.reason === "Other" || item.condition === "Other") && !item.otherExplanation?.trim())
      return "Explain the Other reason or condition";
  }
  return null;
}

export async function requireReturnPermission(
  request: Request,
  action: string,
  defaultAllow = true,
) {
  const auth = await requireUser(request);
  if (auth.response) return auth;
  const { data: roles, error: roleError } = await sb
    .from("user_roles")
    .select("role")
    .eq("user_id", auth.user.id);
  if (roleError) return { user: null, response: errorJson(500, roleError.message) };
  if ((roles ?? []).some((row: { role?: string | null }) => row.role === "admin")) return auth;
  let settings: Record<string, unknown>;
  try {
    settings = await globalUserPermissions();
  } catch (permissionError) {
    return {
      user: null,
      response: errorJson(500, permissionError instanceof Error ? permissionError.message : "Permission check failed"),
    };
  }
  const key = `perm_purchase_returns_${action}`;
  const legacyAllowed =
    settings.perm_user_purchases !== false && settings.perm_user_purchases !== "false";
  const allowed =
    settings[key] == null
      ? defaultAllow && legacyAllowed
      : settings[key] !== false && settings[key] !== "false";
  return allowed
    ? auth
    : { user: null, response: errorJson(403, `Purchase return ${action} permission required`) };
}

export function purchaseItems(value: unknown) {
  if (!Array.isArray(value)) return [];
  return (value as Array<Record<string, unknown>>).map((raw) => ({
    productId: String(raw.productId ?? raw.product_id ?? ""),
    productName: String(raw.productName ?? raw.product_name ?? raw.name ?? "Product"),
    quantity: Number(raw.quantity ?? raw.qty ?? 0),
    unitCost: money(raw.unitCost ?? raw.unit_cost ?? raw.cost ?? raw.price),
    categoryId: raw.categoryId ?? raw.category_id ?? null,
    categoryName: String(raw.categoryName ?? raw.category_name ?? "Other"),
  }));
}

export async function returnableItems(purchaseOrderId: string, ownerId: string) {
  const { data: order, error } = await sb
    .from("purchase_orders")
    .select("*")
    .eq("id", purchaseOrderId)
    .maybeSingle();
  if (error) return { order: null, items: [], error: error.message };
  if (!order || order.status !== "received")
    return { order: null, items: [], error: "Only received purchases can be returned" };
  const items = purchaseItems(order.items);
  const { data: prior, error: priorError } = await (sb as any)
    .from("purchase_return_items")
    .select("product_id,quantity_returned,purchase_returns!inner(status,purchase_order_id)")
    .eq("purchase_returns.purchase_order_id", purchaseOrderId)
    .in("purchase_returns.status", ["pending_approval", "approved", "completed"]);
  if (priorError) return { order: null, items: [], error: priorError.message };
  const returned = new Map<string, number>();
  for (const row of prior ?? [])
    returned.set(
      String(row.product_id),
      (returned.get(String(row.product_id)) ?? 0) + Number(row.quantity_returned),
    );
  return {
    order,
    items: items.map((item) => ({
      ...item,
      quantityPreviouslyReturned: returned.get(item.productId) ?? 0,
      quantityReturnable: Math.max(item.quantity - (returned.get(item.productId) ?? 0), 0),
    })),
    error: null as string | null,
  };
}
