import { errorJson, requireUser, sb } from "./_resource-helpers";
import { globalUserPermissions } from "./-permission-helpers";

export const REFUND_METHODS = [
  "cash",
  "card",
  "mobile_money",
  "store_credit",
  "bank_transfer",
] as const;

export function money(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

export type ReturnLineInput = {
  saleLineId: string;
  quantityReturned: number;
  reason?: string;
  condition?: string;
};

export function normalizeReturnLines(value: unknown): ReturnLineInput[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw: Record<string, unknown>) => ({
    saleLineId: String(raw.saleLineId ?? raw.sale_line_id ?? ""),
    quantityReturned: Number(raw.quantityReturned ?? raw.quantity_returned ?? 0),
    reason: raw.reason ? String(raw.reason) : undefined,
    condition: raw.condition ? String(raw.condition) : undefined,
  }));
}

export function validateReturnLines(lines: ReturnLineInput[]) {
  if (!lines.length) return "Select at least one line to return";
  const seen = new Set<string>();
  for (const line of lines) {
    if (!line.saleLineId || seen.has(line.saleLineId)) return "Each returned line must be unique";
    seen.add(line.saleLineId);
    if (!Number.isFinite(line.quantityReturned) || line.quantityReturned <= 0)
      return "Return quantity must be greater than zero";
  }
  return null;
}

/** Mirrors requireReturnPermission (purchase returns) for the sales-return surface. */
export async function requireSalesReturnPermission(
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
      response: errorJson(
        500,
        permissionError instanceof Error ? permissionError.message : "Permission check failed",
      ),
    };
  }
  const key = `perm_sales_returns_${action}`;
  const allowed =
    settings[key] == null ? defaultAllow : settings[key] !== false && settings[key] !== "false";
  return allowed
    ? auth
    : { user: null, response: errorJson(403, `Sales return ${action} permission required`) };
}

/** Batch-resolves customers.uuid_id -> name, matching the pattern used for sales listings. */
export async function customerNameMap(customerIds: string[]) {
  const ids = Array.from(new Set(customerIds.filter(Boolean)));
  const names = new Map<string, string>();
  if (!ids.length) return names;
  const { data } = await (sb as any).from("customers").select("id,uuid_id,name").in("uuid_id", ids);
  for (const customer of data ?? [])
    names.set(String(customer.uuid_id ?? customer.id), customer.name);
  return names;
}

/** Batch-resolves sale ids -> invoice reference, for display on the returns list. */
export async function saleReferenceMap(saleIds: string[]) {
  const ids = Array.from(new Set(saleIds.filter(Boolean)));
  const refs = new Map<string, string>();
  if (!ids.length) return refs;
  const { data } = await (sb as any).from("sales").select("id,reference").in("id", ids);
  for (const sale of data ?? []) refs.set(String(sale.id), sale.reference ?? sale.id);
  return refs;
}
