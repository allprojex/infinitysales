import { createFileRoute } from "@tanstack/react-router";
import { sb, requireUser, json } from "./_resource-helpers";

export const Route = createFileRoute("/api/cash-sessions/$id/movements/$movementId")({
  server: {
    handlers: {
      DELETE: async ({ request, params }) => {
        const auth = await requireUser(request);
        if (auth.response) return auth.response;
        const { error } = await sb
          .from("cash_movements")
          .delete()
          .eq("user_id", auth.user.id)
          .eq("id", params.movementId);
        if (error) return json({ message: error.message }, { status: 500 });
        return json({ ok: true });
      },
    },
  },
});
