/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { actorFromUser, recordAudit } from "./_audit";
import { errorJson, json, rowToApi, safeJson, sb } from "./_resource-helpers";
import { notify } from "./_notify";
import { requireReturnPermission } from "./-purchase-return-helpers";

export const Route = createFileRoute("/api/purchase-returns/$id/action")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const body = await safeJson(request);
        const action = String(body.action ?? "");
        const permission = action === "submit" ? "submit" : action;
        const auth = await requireReturnPermission(request, permission, action !== "reverse");
        if (auth.response) return auth.response;
        const { data: current, error: readError } = await (sb as any)
          .from("purchase_returns")
          .select("*")
          .eq("id", params.id)
          .maybeSingle();
        if (readError) return errorJson(500, readError.message);
        if (!current) return errorJson(404, "Purchase return not found");
        let data: any;
        let error: any;
        if (action === "submit") {
          if (current.status !== "draft") return errorJson(409, "Only a draft can be submitted");
          ({ data, error } = await (sb as any)
            .from("purchase_returns")
            .update({
              status: "pending_approval",
              submitted_by: auth.user.id,
              submitted_at: new Date().toISOString(),
            })
            .eq("id", params.id)
            .eq("status", "draft")
            .select("*")
            .single());
        } else if (action === "approve") {
          if (current.status !== "pending_approval")
            return errorJson(409, "Only a pending return can be approved");
          if (current.created_by === auth.user.id)
            return errorJson(403, "You cannot approve your own purchase return");
          ({ data, error } = await (sb as any)
            .from("purchase_returns")
            .update({
              status: "approved",
              approved_by: auth.user.id,
              approved_at: new Date().toISOString(),
            })
            .eq("id", params.id)
            .eq("status", "pending_approval")
            .select("*")
            .single());
        } else if (action === "complete") {
          ({ data, error } = await (sb as any).rpc("complete_purchase_return", {
            p_return_id: params.id,
            p_actor: auth.user.id,
          }));
        } else if (action === "reverse") {
          ({ data, error } = await (sb as any).rpc("reverse_purchase_return", {
            p_return_id: params.id,
            p_actor: auth.user.id,
            p_reason: String(body.reason ?? ""),
          }));
        } else return errorJson(400, "Unsupported workflow action");
        if (error) return errorJson(error.message?.includes("already") ? 409 : 400, error.message);
        const actor = await actorFromUser(auth.user);
        await recordAudit({
          ...actor,
          action: `purchase_return.${action}`,
          entityType: "purchase_return",
          entityId: params.id,
          entityName: current.return_number,
          details: body.reason ? { reason: body.reason } : null,
        });
        await notify({
          userId: current.user_id,
          type: "purchase-return",
          severity: action === "reverse" ? "warning" : "success",
          title: `Purchase return ${action}${action.endsWith("e") ? "d" : "ed"}`,
          message: current.return_number,
          link: "/purchase-returns",
          metadata: { id: params.id, action },
        });
        return json(rowToApi(data));
      },
    },
  },
});
