/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { actorFromUser, recordAudit } from "./_audit";
import { errorJson, json, rowToApi, safeJson, sb } from "./_resource-helpers";
import { requireReturnPermission } from "./-purchase-return-helpers";

export const Route = createFileRoute("/api/purchase-returns/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireReturnPermission(request, "view");
        if (auth.response) return auth.response;
        const { data, error } = await (sb as any)
          .from("purchase_returns")
          .select("*,purchase_return_items(*),purchase_return_settlements(*),purchase_orders(*)")
          .eq("id", params.id)
          .maybeSingle();
        if (error) return errorJson(500, error.message);
        if (!data) return errorJson(404, "Purchase return not found");
        return json({
          ...rowToApi(data),
          items: (data.purchase_return_items ?? []).map(rowToApi),
          settlements: (data.purchase_return_settlements ?? []).map(rowToApi),
          purchase: rowToApi(data.purchase_orders),
        });
      },
      PATCH: async ({ request, params }) => {
        const auth = await requireReturnPermission(request, "edit");
        if (auth.response) return auth.response;
        const body = await safeJson(request);
        const { data: existing } = await (sb as any)
          .from("purchase_returns")
          .select("status")
          .eq("id", params.id)
          .maybeSingle();
        if (!existing) return errorJson(404, "Purchase return not found");
        if (existing.status !== "draft") return errorJson(409, "Only draft returns can be edited");
        const update = {
          reason_summary: body.reasonSummary,
          reason: body.reasonSummary,
          notes: body.notes,
          returned_at: body.returnDate,
          settlement_type: body.settlementType,
        };
        const { data, error } = await (sb as any)
          .from("purchase_returns")
          .update(update)
          .eq("id", params.id)
          .select("*")
          .single();
        if (error) return errorJson(500, error.message);
        return json(rowToApi(data));
      },
      DELETE: async ({ request, params }) => {
        const auth = await requireReturnPermission(request, "cancel");
        if (auth.response) return auth.response;
        const body = await safeJson(request);
        const reason = String(body.reason ?? "").trim();
        if (!reason) return errorJson(400, "Cancellation reason is required");
        const { data, error } = await (sb as any)
          .from("purchase_returns")
          .update({
            status: "cancelled",
            cancelled_by: auth.user.id,
            cancelled_at: new Date().toISOString(),
            cancellation_reason: reason,
          })
          .eq("id", params.id)
          .in("status", ["draft", "pending_approval", "approved"])
          .select("*")
          .maybeSingle();
        if (error) return errorJson(500, error.message);
        if (!data) return errorJson(409, "This return cannot be cancelled");
        const actor = await actorFromUser(auth.user);
        await recordAudit({
          ...actor,
          action: "purchase_return.cancel",
          entityType: "purchase_return",
          entityId: params.id,
          entityName: data.return_number,
          details: { reason },
        });
        return json(rowToApi(data));
      },
    },
  },
});
