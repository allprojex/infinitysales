import { createFileRoute } from "@tanstack/react-router";
import { sb, requireUser, json } from "./_resource-helpers";
import { notify } from "./_notify";
import { customerUuid, resolveCustomer } from "./-customer-credit-helpers";

export const Route = createFileRoute("/api/customer-credits/customer/$id/setup")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireUser(request);
        if (auth.response) return auth.response;
        const body = await request.json().catch(() => ({}));
        const resolved = await resolveCustomer(auth.user.id, params.id);
        if (resolved.error) return json({ message: resolved.error }, { status: 404 });
        const { data, error } = await sb
          .from("customer_credits")
          .insert({
            user_id: auth.user.id,
            customer_id: customerUuid(resolved.customer!),
            type: "setup",
            amount: Number(body.creditLimit ?? 0) || 0,
            reference: body.status ?? "active",
            notes: body.notes ?? "Credit account setup",
          } as never)
          .select("*")
          .single();
        if (error) return json({ message: error.message }, { status: 500 });
        await notify({
          userId: auth.user.id,
          type: "customer-credit",
          severity: "info",
          title: "Credit account setup",
          message: body.notes ?? "Customer credit account opened",
          link: "/customer-credits",
          metadata: {
            id: (data as { id?: unknown } | null)?.id,
            customerId: params.id,
            action: "setup",
          },
        });
        return json({ ok: true, record: data });
      },
    },
  },
});
