import { createFileRoute } from "@tanstack/react-router";
import {
  accountFromRows,
  customerUuid,
  resolveCustomer,
  type CreditRow,
  type CustomerRow,
} from "./-customer-credit-helpers";
import {
  apiToRow,
  errorJson,
  json,
  parseQuery,
  requireUser,
  safeJson,
  sb,
} from "./_resource-helpers";

export const Route = createFileRoute("/api/customer-credits")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const { page, limit, search, params } = parseQuery(request);
        const status = params.get("status") ?? "";
        const { data: customers, error: customerError } = await sb
          .from("customers")
          .select("id, uuid_id, name, email, phone, company")
          .eq("user_id", user.id);
        if (customerError) return errorJson(500, customerError.message);

        const { data: credits, error: creditError } = await sb
          .from("customer_credits")
          .select("*")
          .eq("user_id", user.id)
          .order("occurred_at", { ascending: true });
        if (creditError) return errorJson(500, creditError.message);

        const byCustomer = new Map<string, CreditRow[]>();
        for (const row of (credits ?? []) as CreditRow[]) {
          const key = String(row.customer_id);
          byCustomer.set(key, [...(byCustomer.get(key) ?? []), row]);
        }

        let accounts = ((customers ?? []) as CustomerRow[])
          .map((customer) => {
            const rows = byCustomer.get(String(customer.uuid_id ?? customer.id)) ?? [];
            return rows.length ? accountFromRows(customer, rows) : null;
          })
          .filter(Boolean) as ReturnType<typeof accountFromRows>[];

        if (status) accounts = accounts.filter((account) => account.status === status);
        if (search) {
          const needle = search.toLowerCase();
          accounts = accounts.filter((account) =>
            [
              account.customer_name,
              account.customer_email,
              account.customer_phone,
              account.customer_company,
            ]
              .filter(Boolean)
              .some((value) => String(value).toLowerCase().includes(needle)),
          );
        }

        accounts.sort((a, b) =>
          String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")),
        );
        return json({ data: accounts, total: accounts.length, page, limit });
      },
      POST: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const body = await safeJson(request);
        if (!body?.customerId) return errorJson(400, "customerId is required");
        const resolved = await resolveCustomer(user.id, String(body.customerId));
        if (resolved.error) return errorJson(404, resolved.error);
        const row = {
          ...apiToRow(body),
          user_id: user.id,
          customer_id: customerUuid(resolved.customer!),
        };
        const { data, error } = await sb
          .from("customer_credits")
          .insert(row as never)
          .select("*")
          .single();
        if (error) return errorJson(500, error.message);
        return json(data);
      },
    },
  },
});
