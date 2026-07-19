import { createFileRoute } from "@tanstack/react-router";
import {
  apiToRow,
  errorJson,
  json,
  requireUser,
  rowToApi,
  safeJson,
  sb,
} from "./_resource-helpers";

export const Route = createFileRoute("/api/loyalty/redeem")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const body = await safeJson(request);
        if (!body?.customerId) return errorJson(400, "customerId is required");
        if (body?.points == null) return errorJson(400, "points is required");
        const row = { ...apiToRow(body), user_id: user.id, type: "redeem" };
        const { data, error } = await sb
          .from("loyalty_transactions")
          .insert(row as any)
          .select("*")
          .single();
        if (error) return errorJson(500, error.message);
        return json(rowToApi(data));
      },
    },
  },
});
