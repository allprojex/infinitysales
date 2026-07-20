import { createFileRoute } from "@tanstack/react-router";
import { sb, requireUser, json, rowToApi } from "./_resource-helpers";

// bank-reconciliation.tsx's reconcile checkbox sends PATCH; only POST used to be
// registered here, so every reconcile click 405'd.
const reconcileHandler = async ({
  request,
  params,
}: {
  request: Request;
  params: { txnId: string };
}) => {
  const auth = await requireUser(request);
  if (auth.response) return auth.response;
  const body = await request.json().catch(() => ({}));
  const reconciled = body.reconciled !== false;
  const { data, error } = await sb
    .from("bank_transactions")
    .update({
      reconciled,
      reconciled_at: reconciled ? new Date().toISOString() : null,
      reconciled_by: reconciled ? auth.user.id : null,
    })
    .eq("user_id", auth.user.id)
    .eq("id", params.txnId)
    .select("*")
    .single();
  if (error) return json({ message: error.message }, { status: 500 });
  return json(rowToApi(data));
};

export const Route = createFileRoute("/api/bank-accounts/$id/transactions/$txnId/reconcile")({
  server: {
    handlers: {
      POST: reconcileHandler,
      PATCH: reconcileHandler,
    },
  },
});
