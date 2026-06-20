import { createFileRoute } from "@tanstack/react-router";
import { sb, requireUser, json, rowToApi } from "./_resource-helpers";

export const Route = createFileRoute("/api/promotions/$id/status")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const auth = await requireUser(request); if (auth.response) return auth.response;
        const body = await request.json().catch(() => ({}));
        const { data, error } = await sb.from("promotions").update({ is_active: !!body.isActive })
          .eq("user_id", auth.user.id).eq("id", params.id).select("*").single();
        if (error) return json({ message: error.message }, { status: 500 });
        return json(rowToApi(data));
      },
    },
  },
});
