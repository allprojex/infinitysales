import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireUser, rowToApi, sb } from "./_resource-helpers";
import {
  accountFromRows,
  customerUuid,
  resolveCustomer,
  transactionRows,
  type CreditRow,
} from "./-customer-credit-helpers";

export const Route = createFileRoute("/api/customer-credits/customer/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const resolved = await resolveCustomer(user.id, params.id);
        if (resolved.error) return errorJson(404, resolved.error);
        const customer = resolved.customer!;
        const { data, error } = await sb
          .from("customer_credits")
          .select("*")
          .eq("user_id", user.id)
          .eq("customer_id", customerUuid(customer))
          .order("occurred_at", { ascending: false });
        if (error) return errorJson(500, error.message);
        const rows = (data ?? []).map(rowToApi);
        const creditRows = (data ?? []) as CreditRow[];
        const account = accountFromRows(customer, creditRows);
        return json({
          credit: {
            id: account.id,
            customer_id: account.customer_id,
            credit_limit: account.credit_limit,
            outstanding: account.outstanding,
            total_borrowed: account.total_borrowed,
            total_paid: account.total_paid,
            status: account.status,
            notes: account.notes,
          },
          customer: {
            id: customer.id,
            name: customer.name,
            email: customer.email,
            phone: customer.phone ?? null,
            company: customer.company ?? null,
          },
          transactions: transactionRows(creditRows),
          items: rows,
          balance: Number(account.outstanding),
        });
      },
    },
  },
});
