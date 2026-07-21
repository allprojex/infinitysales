import { createFileRoute } from "@tanstack/react-router";
import {
  apiToRow,
  errorJson,
  json,
  loadResourceScope,
  requireHrmAccess,
  rowToApi,
  safeJson,
  sb,
} from "./_resource-helpers";

// Departments are shared company HRM data (see departments.ts) -- reads are
// open to any account with HRM access; only privileged roles (or the
// creator) may edit/delete.
export const Route = createFileRoute("/api/departments/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { user, response } = await requireHrmAccess(request);
        if (!user) return response;
        const { data, error } = await sb
          .from("departments")
          .select("*")
          .eq("id", params.id)
          .maybeSingle();
        if (error) return errorJson(500, error.message);
        if (!data) return errorJson(404, "Not found");
        return json(rowToApi(data));
      },
      PUT: async ({ request, params }) => {
        const { user, response } = await requireHrmAccess(request);
        if (!user) return response;
        const scope = await loadResourceScope(user.id);
        if (scope.error) return errorJson(500, scope.error);
        const body = await safeJson(request);
        let q = sb
          .from("departments")
          .update(apiToRow(body) as never)
          .eq("id", params.id);
        if (!scope.isPrivileged) q = q.eq("user_id", user.id);
        const { data, error } = await q.select("*").maybeSingle();
        if (error) return errorJson(500, error.message);
        if (!data) return errorJson(404, "Not found");
        return json(rowToApi(data));
      },
      DELETE: async ({ request, params }) => {
        const { user, response } = await requireHrmAccess(request);
        if (!user) return response;
        const scope = await loadResourceScope(user.id);
        if (scope.error) return errorJson(500, scope.error);
        let q = sb.from("departments").delete().eq("id", params.id);
        if (!scope.isPrivileged) q = q.eq("user_id", user.id);
        const { data, error } = await q.select("id").maybeSingle();
        if (error) return errorJson(500, error.message);
        if (!data) return errorJson(404, "Not found");
        return json({ ok: true });
      },
    },
  },
});
