import { createFileRoute } from "@tanstack/react-router";
import { sb, requireUser, json } from "./_resource-helpers";
import { notify } from "./_notify";
import { customerUuid, resolveCustomer } from "./-customer-credit-helpers";

export const Route = createFileRoute("/api/customer-credits/customer/$id/payment")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireUser(request);
        if (auth.response) return auth.response;
        const body = await request.json().catch(() => ({}));
        const amount = Number(body.amount ?? 0);
        if (!Number.isFinite(amount) || amount <= 0)
          return json({ message: "amount must be greater than 0" }, { status: 400 });
        const resolved = await resolveCustomer(auth.user.id, params.id);
        if (resolved.error) return json({ message: resolved.error }, { status: 404 });
        const { data, error } = await sb
          .from("customer_credits")
          .insert({
            user_id: auth.user.id,
            customer_id: customerUuid(resolved.customer!),
            type: "payment",
            amount,
            reference: body.reference,
            notes: body.notes,
          } as never)
          .select("*")
          .single();
        if (error) return json({ message: error.message }, { status: 500 });
        await notify({
          userId: auth.user.id,
          type: "customer-credit",
          severity: "success",
          title: "Credit payment received",
          message: `${amount} received from customer`,
          link: "/customer-credits",
          metadata: {
            id: (data as { id?: unknown } | null)?.id,
            customerId: params.id,
            action: "payment",
          },
        });
        return json(data);
      },
    },
  },
});
