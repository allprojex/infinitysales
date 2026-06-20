import { createFileRoute } from "@tanstack/react-router";
import { sb, requireUser, json } from "./_resource-helpers";
import { notify } from "./_notify";

export const Route = createFileRoute("/api/customer-credits/customer/$id/charge")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireUser(request); if (auth.response) return auth.response;
        const body = await request.json().catch(() => ({}));
        const amount = Number(body.amount ?? 0);
        const { data, error } = await sb.from("customer_credits").insert({
          user_id: auth.user.id, customer_id: params.id,
          type: "charge", amount,
          reference: body.reference, notes: body.notes,
        } as any).select("*").single();
        if (error) return json({ message: error.message }, { status: 500 });
        await notify({
          userId: auth.user.id,
          type: "customer-credit",
          severity: "warning",
          title: "Credit charged",
          message: `${amount} charged to customer account`,
          link: "/customer-credits",
          metadata: { id: (data as any)?.id, customerId: params.id, action: "charge" },
        });
        return json(data);
      },
    },
  },
});
