import { createFileRoute } from "@tanstack/react-router";
import { sb, requireAdmin, json } from "./_resource-helpers";

export const Route = createFileRoute("/api/admin/generated-reports/$id")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const auth = await requireAdmin(request);
        if (auth.response) return auth.response;
        const body = await request.json().catch(() => ({}));
        const patch: Record<string, any> = {};
        if (body.title !== undefined) patch.title = body.title;
        if (body.notes !== undefined) patch.notes = body.notes;
        const { data, error } = await sb.from("generated_reports").update(patch as any)
          .eq("user_id", auth.user.id).eq("id", Number(params.id)).select("*").single();
        if (error) return json({ message: error.message }, { status: 500 });
        return json(data);
      },
      DELETE: async ({ request, params }) => {
        const auth = await requireAdmin(request);
        if (auth.response) return auth.response;
        const { error } = await sb.from("generated_reports").delete()
          .eq("user_id", auth.user.id).eq("id", Number(params.id));
        if (error) return json({ message: error.message }, { status: 500 });
        return json({ success: true });
      },
    },
  },
});
