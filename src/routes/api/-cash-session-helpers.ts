import { sb } from "./_resource-helpers";

// cash_movements.type values the frontend actually sends (cash-management.tsx
// MOVEMENT_TYPES). Anything not listed here reduces the drawer; only these
// add to it. Previously the only place this was computed
// (cash-sessions.$id.close.ts) checked `type === "out"` literally, which
// never matched "cash_out"/"payout"/"refund" — every non-"cash_in" movement
// was silently added to the expected balance instead of subtracted.
const POSITIVE_TYPES = new Set(["cash_in"]);

// The opening float is recorded as its own "float_adjustment" movement (so
// it shows up in the movement log for an audit trail), but it must NOT be
// counted again in totalIn/expected — openingAmount (from
// cash_sessions.opening_balance) already represents it, and both the
// frontend's currentBalance formula and close.ts's expected-balance formula
// add openingAmount + totalIn - totalOut. Counting it in both would double
// the opening float in every balance shown.
const EXCLUDED_FROM_TOTALS = new Set(["float_adjustment"]);

export function movementDelta(type: string, amount: number): number {
  if (EXCLUDED_FROM_TOTALS.has(type)) return 0;
  return POSITIVE_TYPES.has(type) ? amount : -amount;
}

export async function sessionMovementTotals(userId: string, sessionId: string) {
  const { data, error } = await (sb as any)
    .from("cash_movements")
    .select("type, amount")
    .eq("user_id", userId)
    .eq("cash_session_id", sessionId);
  if (error) return { totalIn: 0, totalOut: 0, movementCount: 0, error: error.message };

  let totalIn = 0;
  let totalOut = 0;
  for (const m of data ?? []) {
    if (EXCLUDED_FROM_TOTALS.has(m.type)) continue;
    const amount = Number(m.amount) || 0;
    if (POSITIVE_TYPES.has(m.type)) totalIn += amount;
    else totalOut += amount;
  }
  return { totalIn, totalOut, movementCount: (data ?? []).length, error: null as string | null };
}

export async function cashierNameMap(cashierIds: string[]) {
  const ids = Array.from(new Set(cashierIds.filter(Boolean)));
  const names = new Map<string, string>();
  if (!ids.length) return names;
  const { data } = await (sb as any)
    .from("profiles")
    .select("auth_id,name,email")
    .in("auth_id", ids);
  for (const profile of data ?? []) {
    names.set(String(profile.auth_id), profile.name ?? profile.email ?? "Unknown");
  }
  return names;
}

// The one consistent response shape every cash-sessions endpoint should
// return — the frontend (cash-management.tsx) reads these exact camelCase
// names for both the sidebar list and the detail pane (it previously mixed
// snake_case and camelCase reads because different endpoints returned
// different, incomplete shapes).
export function toCashSessionApi(
  row: Record<string, any>,
  opts: {
    cashierName?: string;
    totalIn?: number;
    totalOut?: number;
    movementCount?: number;
  } = {},
) {
  return {
    id: row.id,
    cashierId: row.cashier_id ?? null,
    cashierName: opts.cashierName ?? "Unknown",
    branchId: row.branch_id ?? null,
    terminal: row.terminal ?? "Main Register",
    status: row.status,
    openingAmount: Number(row.opening_balance ?? 0),
    closingAmount: row.closing_balance != null ? Number(row.closing_balance) : null,
    expectedAmount: row.expected_balance != null ? Number(row.expected_balance) : null,
    difference: row.difference != null ? Number(row.difference) : null,
    notes: row.notes ?? null,
    openedAt: row.opened_at,
    closedAt: row.closed_at ?? null,
    totalIn: opts.totalIn ?? 0,
    totalOut: opts.totalOut ?? 0,
    movementCount: opts.movementCount ?? 0,
  };
}

export function toCashMovementApi(row: Record<string, any>, createdByName?: string) {
  return {
    id: row.id,
    sessionId: row.cash_session_id,
    type: row.type,
    amount: Number(row.amount ?? 0),
    reference: row.reference ?? null,
    notes: row.reason ?? null,
    createdBy: row.user_id ?? null,
    createdByName: createdByName ?? null,
    createdAt: row.occurred_at ?? row.created_at,
  };
}
