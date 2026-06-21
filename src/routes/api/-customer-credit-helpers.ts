import { sb } from "./_resource-helpers";

export type CustomerRow = {
  id: number;
  uuid_id?: string | null;
  name: string;
  email: string;
  phone?: string | null;
  company?: string | null;
};

export type CreditRow = {
  id: string;
  customer_id: string;
  amount: unknown;
  type: string | null;
  reference?: string | null;
  notes?: string | null;
  occurred_at?: string;
  created_at?: string;
  updated_at?: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function resolveCustomer(userId: string, id: string) {
  let q = sb
    .from("customers")
    .select("id, uuid_id, name, email, phone, company")
    .eq("user_id", userId);

  if (UUID_RE.test(id)) q = q.eq("uuid_id", id);
  else q = q.eq("id", Number(id));

  const { data, error } = await q.maybeSingle();
  if (error) return { customer: null as CustomerRow | null, error: error.message };
  if (!data) return { customer: null as CustomerRow | null, error: "Customer not found" };
  return { customer: data as CustomerRow, error: null as string | null };
}

export function customerUuid(customer: CustomerRow) {
  return customer.uuid_id ?? String(customer.id);
}

export function signedCreditAmount(row: Pick<CreditRow, "type" | "amount">) {
  const amount = Number(row.amount ?? 0) || 0;
  if (row.type === "setup") return 0;
  if (row.type === "payment" || row.type === "debit" || row.type === "refund")
    return -Math.abs(amount);
  if (row.type === "adjust") return amount;
  return Math.abs(amount);
}

export function accountFromRows(customer: CustomerRow, rows: CreditRow[]) {
  const setupRows = rows.filter((row) => row.type === "setup");
  const latestSetup = setupRows.sort((a, b) =>
    String(b.created_at ?? b.occurred_at ?? "").localeCompare(
      String(a.created_at ?? a.occurred_at ?? ""),
    ),
  )[0];
  const outstanding = rows.reduce((sum, row) => sum + signedCreditAmount(row), 0);
  const totalBorrowed = rows.reduce((sum, row) => {
    const signed = signedCreditAmount(row);
    return signed > 0 ? sum + signed : sum;
  }, 0);
  const totalPaid = rows.reduce((sum, row) => {
    const signed = signedCreditAmount(row);
    return signed < 0 ? sum + Math.abs(signed) : sum;
  }, 0);
  const creditLimit = Number(latestSetup?.amount ?? 0) || 0;
  const updatedAt = rows
    .map((row) => String(row.updated_at ?? row.created_at ?? row.occurred_at ?? ""))
    .sort()
    .at(-1);

  return {
    id: latestSetup?.id ?? customerUuid(customer),
    customer_id: customer.id,
    customer_name: customer.name,
    customer_email: customer.email,
    customer_phone: customer.phone ?? null,
    customer_company: customer.company ?? null,
    credit_limit: creditLimit.toFixed(2),
    outstanding: outstanding.toFixed(2),
    available_credit: creditLimit > 0 ? (creditLimit - outstanding).toFixed(2) : "0.00",
    total_borrowed: totalBorrowed.toFixed(2),
    total_paid: totalPaid.toFixed(2),
    status: latestSetup?.reference ?? "active",
    notes: latestSetup?.notes ?? null,
    created_at: rows[0]?.created_at ?? rows[0]?.occurred_at ?? null,
    updated_at: updatedAt ?? rows[0]?.updated_at ?? rows[0]?.created_at ?? null,
  };
}

export function transactionRows(rows: CreditRow[]) {
  let balance = 0;
  const chronological = [...rows].sort((a, b) =>
    String(a.occurred_at ?? a.created_at ?? "").localeCompare(
      String(b.occurred_at ?? b.created_at ?? ""),
    ),
  );
  const withBalance = chronological.map((row) => {
    balance += signedCreditAmount(row);
    return {
      id: row.id,
      type: row.type ?? "credit",
      amount: String(row.amount ?? 0),
      balance_after: balance.toFixed(2),
      reference: row.reference ?? null,
      notes: row.notes ?? null,
      created_by_name: null,
      created_at: row.created_at ?? row.occurred_at ?? "",
      sale_id: null,
    };
  });
  return withBalance.reverse();
}
