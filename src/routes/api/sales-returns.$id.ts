import { createFileRoute } from "@tanstack/react-router";
import { sb, requireUser, json, apiToRow, rowToApi } from "./_resource-helpers";

export const Route = createFileRoute("/api/sales-returns/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireUser(request); if (auth.response) return auth.response;
        const { data, error } = await sb.from("sales_returns").select("*")
          .eq("user_id", auth.user.id).eq("id", params.id).maybeSingle();
        if (error) return json({ message: error.message }, { status: 500 });
        if (!data) return json({ message: "Not found" }, { status: 404 });
        return json(rowToApi(data));
      },
      PATCH: async ({ request, params }) => {
        const auth = await requireUser(request); if (auth.response) return auth.response;
        const body = await request.json().catch(() => ({}));
        const { data, error } = await sb.from("sales_returns").update(apiToRow(body) as any)
          .eq("user_id", auth.user.id).eq("id", params.id).select("*").single();
        if (error) return json({ message: error.message }, { status: 500 });
        return json(rowToApi(data));
      },
      DELETE: async ({ request, params }) => {
        const auth = await requireUser(request); if (auth.response) return auth.response;
        const { error } = await sb.from("sales_returns").delete()
          .eq("user_id", auth.user.id).eq("id", params.id);
        if (error) return json({ message: error.message }, { status: 500 });
        return json({ ok: true });
      },
    },
  },
});
