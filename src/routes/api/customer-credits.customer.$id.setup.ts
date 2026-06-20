import { createFileRoute } from "@tanstack/react-router";
import { sb, requireUser, json } from "./_resource-helpers";
import { notify } from "./_notify";

export const Route = createFileRoute("/api/customer-credits/customer/$id/setup")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireUser(request); if (auth.response) return auth.response;
        const body = await request.json().catch(() => ({}));
        const { data, error } = await sb.from("customer_credits").insert({
          user_id: auth.user.id,
          customer_id: params.id,
          type: "setup",
          amount: 0,
          notes: body.notes ?? "Credit account setup",
        } as any).select("*").single();
        if (error) return json({ message: error.message }, { status: 500 });
        await notify({
          userId: auth.user.id,
          type: "customer-credit",
          severity: "info",
          title: "Credit account setup",
          message: body.notes ?? "Customer credit account opened",
          link: "/customer-credits",
          metadata: { id: (data as any)?.id, customerId: params.id, action: "setup" },
        });
        return json({ ok: true, record: data });
      },
    },
  },
});
