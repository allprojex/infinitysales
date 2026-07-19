import { createFileRoute } from "@tanstack/react-router";
import {
  apiToRow,
  errorJson,
  json,
  requireUser,
  rowToApi,
  safeJson,
  sb,
} from "./_resource-helpers";

export const Route = createFileRoute("/api/projects/$id/tasks")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const { data, error } = await sb
          .from("tasks")
          .select("*")
          .eq("user_id", user.id)
          .eq("project_id", params.id)
          .order("created_at", { ascending: false });
        if (error) return errorJson(500, error.message);
        return json((data ?? []).map(rowToApi));
      },
      POST: async ({ request, params }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const body = await safeJson(request);
        if (!body?.title) return errorJson(400, "title is required");
        const row = { ...apiToRow(body), project_id: params.id, user_id: user.id };
        const { data, error } = await sb
          .from("tasks")
          .insert(row as any)
          .select("*")
          .single();
        if (error) return errorJson(500, error.message);
        return json(rowToApi(data));
      },
    },
  },
});
