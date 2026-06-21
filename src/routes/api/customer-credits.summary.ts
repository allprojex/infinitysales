import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireUser, sb } from "./_resource-helpers";
import { accountFromRows, type CreditRow, type CustomerRow } from "./-customer-credit-helpers";

export const Route = createFileRoute("/api/customer-credits/summary")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const { data: customers, error: customerError } = await sb
          .from("customers")
          .select("id, uuid_id, name, email, phone, company")
          .eq("user_id", user.id);
        if (customerError) return errorJson(500, customerError.message);
        const { data, error } = await sb
          .from("customer_credits")
          .select("*")
          .eq("user_id", user.id);
        if (error) return errorJson(500, error.message);

        const byCustomer = new Map<string, CreditRow[]>();
        for (const row of (data ?? []) as CreditRow[]) {
          const key = String(row.customer_id);
          byCustomer.set(key, [...(byCustomer.get(key) ?? []), row]);
        }
        const accounts = ((customers ?? []) as CustomerRow[])
          .map((customer) => {
            const rows = byCustomer.get(String(customer.uuid_id ?? customer.id)) ?? [];
            return rows.length ? accountFromRows(customer, rows) : null;
          })
          .filter(Boolean) as ReturnType<typeof accountFromRows>[];

        const totalOutstanding = accounts.reduce(
          (sum, account) => sum + Number(account.outstanding),
          0,
        );
        const totalPaid = accounts.reduce((sum, account) => sum + Number(account.total_paid), 0);
        const totalBorrowed = accounts.reduce(
          (sum, account) => sum + Number(account.total_borrowed),
          0,
        );
        const totalCreditLimit = accounts.reduce(
          (sum, account) => sum + Number(account.credit_limit),
          0,
        );

        return json({
          total_accounts: accounts.length,
          active: accounts.filter((account) => account.status === "active").length,
          suspended: accounts.filter((account) => account.status === "suspended").length,
          total_outstanding: totalOutstanding.toFixed(2),
          total_credit_limit: totalCreditLimit.toFixed(2),
          total_paid: totalPaid.toFixed(2),
          accounts_with_balance: accounts.filter((account) => Number(account.outstanding) > 0)
            .length,
          totalCredit: totalBorrowed,
          totalDebit: totalPaid,
          outstanding: totalOutstanding,
          customers: accounts.length,
        });
      },
    },
  },
});
