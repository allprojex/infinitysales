import { createFileRoute } from "@tanstack/react-router";
import { sb, requireUser, json } from "./_resource-helpers";

export const Route = createFileRoute("/api/recycle-bin/$id")({
  server: {
    handlers: {
      DELETE: async ({ request, params }) => {
        const auth = await requireUser(request);
        if (auth.response) return auth.response;
        const { error } = await sb
          .from("recycle_bin")
          .delete()
          .eq("user_id", auth.user.id)
          .eq("id", Number(params.id));
        if (error) return json({ message: error.message }, { status: 500 });
        return json({ success: true });
      },
    },
  },
});
