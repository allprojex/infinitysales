import { createFileRoute } from "@tanstack/react-router";
import { sb, requireUser, json } from "./_resource-helpers";

export const Route = createFileRoute("/api/esl/devices/$id/push")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireUser(request);
        if (auth.response) return auth.response;
        const { error } = await sb.from("esl_sync_history").insert({
          user_id: auth.user.id,
          device_id: params.id,
          action: "push",
          status: "queued",
        } as any);
        if (error) return json({ message: error.message }, { status: 500 });
        return json({ ok: true, queued: true });
      },
    },
  },
});
