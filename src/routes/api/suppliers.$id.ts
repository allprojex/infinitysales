import { createFileRoute } from "@tanstack/react-router";
import {
  apiToRow,
  errorJson,
  json,
  loadResourceScope,
  requireUser,
  rowToApi,
  safeJson,
  sb,
} from "./_resource-helpers";

export const Route = createFileRoute("/api/suppliers/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const { data, error } = await sb
          .from("suppliers")
          .select("*")
          .eq("id", Number(params.id))
          .maybeSingle();
        if (error) return errorJson(500, error.message);
        if (!data) return errorJson(404, "Not found");
        return json(rowToApi(data));
      },
      PUT: async ({ request, params }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const body = await safeJson(request);
        const scope = await loadResourceScope(user.id);
        if (scope.error) return errorJson(500, scope.error);
        let q = sb
          .from("suppliers")
          .update(apiToRow(body) as never)
          .eq("id", Number(params.id));
        if (!scope.isPrivileged) q = q.eq("user_id", user.id);
        const { data, error } = await q.select("*").maybeSingle();
        if (error) return errorJson(500, error.message);
        if (!data) return errorJson(404, "Supplier not found");
        return json(rowToApi(data));
      },
      DELETE: async ({ request, params }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const scope = await loadResourceScope(user.id);
        if (scope.error) return errorJson(500, scope.error);
        let q = sb
          .from("suppliers")
          .delete()
          .eq("id", Number(params.id));
        if (!scope.isPrivileged) q = q.eq("user_id", user.id);
        const { data, error } = await q.select("id").maybeSingle();
        if (error) return errorJson(500, error.message);
        if (!data) return errorJson(404, "Supplier not found");
        return json({ ok: true });
      },
    },
  },
});
