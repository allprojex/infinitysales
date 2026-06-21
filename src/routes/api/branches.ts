import { createFileRoute } from "@tanstack/react-router";
import {
  apiToRow,
  errorJson,
  json,
  parseQuery,
  requireUser,
  safeJson,
  sb,
} from "./_resource-helpers";

export const Route = createFileRoute("/api/branches")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const { limit, offset, search } = parseQuery(request);
        let q = sb
          .from("branches")
          .select("*")
          .order("id", { ascending: false })
          .range(offset, offset + limit - 1);
        if (search) q = q.ilike("name", `%${search}%`);
        const { data, error } = await q;
        if (error) return errorJson(500, error.message);
        return json(data ?? []);
      },
      POST: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const body = await safeJson(request);
        if (!body?.name) return errorJson(400, "name is required");
        const row: Record<string, unknown> = { ...apiToRow(body), user_id: user.id };
        const { data, error } = await sb
          .from("branches")
          .insert(row as never)
          .select("*")
          .single();
        if (error) return errorJson(500, error.message);
        return json(data);
      },
    },
  },
});
