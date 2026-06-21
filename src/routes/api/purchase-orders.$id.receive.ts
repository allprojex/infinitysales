import { createFileRoute } from "@tanstack/react-router";
import { sb, requireUser, json, rowToApi } from "./_resource-helpers";
import { notify } from "./_notify";

export const Route = createFileRoute("/api/purchase-orders/$id/receive")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireUser(request);
        if (auth.response) return auth.response;
        const { data, error } = await sb
          .from("purchase_orders")
          .update({
            status: "received",
            received_date: new Date().toISOString().slice(0, 10),
          })
          .eq("user_id", auth.user.id)
          .eq("id", params.id)
          .select("*")
          .single();
        if (error) return json({ message: error.message }, { status: 500 });
        await notify({
          userId: auth.user.id,
          type: "stock-movement",
          severity: "success",
          title: "Purchase order received",
          message: `PO ${data?.reference ?? params.id} received`,
          link: "/purchases",
          metadata: { id: params.id, action: "receive" },
        });
        return json(rowToApi(data));
      },
    },
  },
});
