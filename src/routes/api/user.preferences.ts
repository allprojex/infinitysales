import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireUser, safeJson, sb } from "./_resource-helpers";

export const Route = createFileRoute("/api/user/preferences")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const { data, error } = await sb.from("user_preferences").select("data").eq("user_id", user.id).maybeSingle();
        if (error) return errorJson(500, error.message);
        return json(data?.data ?? {});
      },
      PUT: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const body = await safeJson(request);
        const { data, error } = await sb.from("user_preferences")
          .upsert({ user_id: user.id, data: body } as any, { onConflict: "user_id" })
          .select("data").single();
        if (error) return errorJson(500, error.message);
        return json(data.data ?? {});
      },
    },
  },
});
