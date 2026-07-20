import { sb } from "./_resource-helpers";

export type BankTxnRow = {
  id: string;
  user_id: string;
  bank_account_id: string;
  occurred_at: string;
  description: string | null;
  reference: string | null;
  amount: number | string;
  type: string;
  reconciled: boolean;
  notes: string | null;
  created_at: string;
};

export function txnDelta(type: string, amount: number): number {
  return type === "credit" ? amount : -amount;
}

/** Batch per-account transaction stats for the accounts list view. */
export async function bankAccountStatsMap(userId: string, accountIds: string[]) {
  type Stats = {
    txn_count: number;
    unreconciled_count: number;
    total_credits: number;
    total_debits: number;
  };
  const stats = new Map<string, Stats>();
  if (!accountIds.length) return stats;
  const { data } = await (sb as any)
    .from("bank_transactions")
    .select("bank_account_id, amount, type, reconciled")
    .eq("user_id", userId)
    .in("bank_account_id", accountIds);
  for (const t of data ?? []) {
    const s: Stats = stats.get(t.bank_account_id) ?? {
      txn_count: 0,
      unreconciled_count: 0,
      total_credits: 0,
      total_debits: 0,
    };
    s.txn_count += 1;
    if (!t.reconciled) s.unreconciled_count += 1;
    const amount = Number(t.amount) || 0;
    if (t.type === "credit") s.total_credits += amount;
    else s.total_debits += amount;
    stats.set(t.bank_account_id, s);
  }
  return stats;
}

/** Given transactions sorted oldest-first, compute a running balance_after for each. */
export function withBalanceAfter<T extends BankTxnRow>(
  openingBalance: number,
  txnsAscending: T[],
): (T & { balance_after: number })[] {
  let running = openingBalance;
  return txnsAscending.map((t) => {
    running += txnDelta(t.type, Number(t.amount) || 0);
    return { ...t, balance_after: running };
  });
}

/** Write-through update of bank_accounts.current_balance by a credit/debit delta. */
export async function adjustAccountBalance(userId: string, accountId: string, delta: number) {
  const { data: acct, error } = await (sb as any)
    .from("bank_accounts")
    .select("current_balance")
    .eq("user_id", userId)
    .eq("id", accountId)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!acct) return { error: "Account not found" };
  const newBalance = (Number(acct.current_balance) || 0) + delta;
  const { error: updError } = await (sb as any)
    .from("bank_accounts")
    .update({ current_balance: newBalance })
    .eq("user_id", userId)
    .eq("id", accountId);
  if (updError) return { error: updError.message };
  return { error: null as string | null, newBalance };
}
