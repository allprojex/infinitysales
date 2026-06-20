import { createFileRoute } from "@tanstack/react-router";
import { sb, requireUser, json } from "./_resource-helpers";

export const Route = createFileRoute("/api/esl/devices/$id/sync")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireUser(request); if (auth.response) return auth.response;
        await sb.from("esl_devices").update({ last_synced_at: new Date().toISOString(), status: "synced" })
          .eq("user_id", auth.user.id).eq("id", params.id);
        await sb.from("esl_sync_history").insert({
          user_id: auth.user.id, device_id: params.id, action: "sync", status: "ok",
        } as any);
        return json({ ok: true });
      },
    },
  },
});
