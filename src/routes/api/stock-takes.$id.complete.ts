import { createFileRoute } from "@tanstack/react-router";
import { sb, requireUser, json, rowToApi } from "./_resource-helpers";
import { notify } from "./_notify";

export const Route = createFileRoute("/api/stock-takes/$id/complete")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireUser(request);
        if (auth.response) return auth.response;
        const { data, error } = await sb
          .from("stock_takes")
          .update({ status: "completed", counted_at: new Date().toISOString() } as any)
          .eq("user_id", auth.user.id)
          .eq("id", params.id)
          .select("*")
          .single();
        if (error) return json({ message: error.message }, { status: 500 });
        await notify({
          userId: auth.user.id,
          type: "stock-movement",
          severity: "success",
          title: "Stock take completed",
          message: `Stock take ${(data as any)?.reference ?? params.id}`,
          link: "/stock-take",
          metadata: { id: params.id, action: "complete" },
        });
        return json(rowToApi(data));
      },
    },
  },
});
