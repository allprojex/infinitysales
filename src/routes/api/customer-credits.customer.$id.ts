import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireUser, rowToApi, sb } from "./_resource-helpers";

export const Route = createFileRoute("/api/customer-credits/customer/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const { data, error } = await sb.from("customer_credits").select("*").eq("user_id", user.id).eq("customer_id", params.id).order("occurred_at", { ascending: false });
        if (error) return errorJson(500, error.message);
        const rows = (data ?? []).map(rowToApi);
        const balance = rows.reduce((s: number, r: any) => s + (r.type === "debit" ? -Number(r.amount || 0) : Number(r.amount || 0)), 0);
        return json({ items: rows, balance });
      },
    },
  },
});
