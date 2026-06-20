import { createFileRoute } from "@tanstack/react-router";
import { sb, requireUser, json, parseQuery, apiToRow, rowToApi } from "./_resource-helpers";
import { notify } from "./_notify";

export const Route = createFileRoute("/api/purchase-returns")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireUser(request); if (auth.response) return auth.response;
        const { limit, offset } = parseQuery(request);
        const { data, error, count } = await sb.from("purchase_returns").select("*", { count: "exact" })
          .eq("user_id", auth.user.id).order("returned_at", { ascending: false }).range(offset, offset + limit - 1);
        if (error) return json({ message: error.message }, { status: 500 });
        return json({ data: (data ?? []).map(rowToApi), total: count ?? 0 });
      },
      POST: async ({ request }) => {
        const auth = await requireUser(request); if (auth.response) return auth.response;
        const body = await request.json().catch(() => ({}));
        const row = { ...apiToRow(body), user_id: auth.user.id };
        const { data, error } = await sb.from("purchase_returns").insert(row).select("*").single();
        if (error) return json({ message: error.message }, { status: 500 });
        await notify({
          userId: auth.user.id,
          type: "supplier-transaction",
          severity: "warning",
          title: "Purchase return created",
          message: `Return ${(data as any)?.reference ?? (data as any)?.id}`,
          link: "/purchase-returns",
          metadata: { id: (data as any)?.id, action: "create" },
        });
        return json(rowToApi(data));
      },
    },
  },
});
