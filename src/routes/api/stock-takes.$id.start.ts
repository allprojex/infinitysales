import { createFileRoute } from "@tanstack/react-router";
import { sb, requireUser, json, rowToApi } from "./_resource-helpers";

export const Route = createFileRoute("/api/stock-takes/$id/start")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireUser(request); if (auth.response) return auth.response;
        const { data, error } = await sb.from("stock_takes").update({ status: "in_progress" } as any)
          .eq("user_id", auth.user.id).eq("id", params.id).select("*").single();
        if (error) return json({ message: error.message }, { status: 500 });
        return json(rowToApi(data));
      },
    },
  },
});
