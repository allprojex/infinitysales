/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { actorFromUser, recordAudit } from "./_audit";
import { errorJson, json, rowToApi, safeJson, sb } from "./_resource-helpers";
import { notify } from "./_notify";
import { requireSalesReturnPermission } from "./-sale-return-helpers";

export const Route = createFileRoute("/api/sales-returns/$id/action")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const body = await safeJson(request);
        const action = String(body.action ?? "");
        if (action !== "reverse") return errorJson(400, "Unsupported workflow action");
        // Reversal moves money and stock backward, so it requires admin-level
        // trust by default rather than the same permission as viewing/creating.
        const auth = await requireSalesReturnPermission(request, "reverse", false);
        if (auth.response) return auth.response;
        const reason = String(body.reason ?? "");
        const { data: current } = await (sb as any)
          .from("sale_returns")
          .select("return_number,user_id")
          .eq("id", params.id)
          .maybeSingle();
        if (!current) return errorJson(404, "Sales return not found");
        const { data, error } = await (sb as any).rpc("reverse_sale_return", {
          p_return_id: params.id,
          p_actor: auth.user.id,
          p_reason: reason,
        });
        if (error) {
          const status = /already|required/i.test(error.message) ? 409 : 400;
          return errorJson(status, error.message);
        }
        const actor = await actorFromUser(auth.user);
        await recordAudit({
          ...actor,
          action: "sale_return.reverse",
          entityType: "sale_return",
          entityId: params.id,
          entityName: current.return_number,
          details: { reason },
        });
        await notify({
          userId: current.user_id,
          type: "sale-return",
          severity: "warning",
          title: "Sales return reversed",
          message: current.return_number,
          link: "/sales-returns",
          metadata: { id: params.id, action: "reverse" },
        });
        return json(rowToApi(data));
      },
    },
  },
});
