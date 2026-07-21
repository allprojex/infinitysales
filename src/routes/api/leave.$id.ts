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

function flatten(row: any) {
  const emp = row?.employee;
  const r = rowToApi(row);
  delete (r as any).employee;
  return { ...r, employeeName: emp?.name ?? null, department: emp?.department ?? null };
}

// Leave requests are shared company HRM data (see leave.ts) -- reads are
// open to any account with HRM access; only privileged roles (or the
// creator) may edit/delete.
export const Route = createFileRoute("/api/leave/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { user, response } = await requireHrmAccess(request);
        if (!user) return response;
        const { data, error } = await sb
          .from("leave_requests")
          .select("*, employee:employees(name, department)")
          .eq("id", params.id)
          .maybeSingle();
        if (error) return errorJson(500, error.message);
        if (!data) return errorJson(404, "Not found");
        return json(flatten(data));
      },
      PUT: async ({ request, params }) => {
        const { user, response } = await requireHrmAccess(request);
        if (!user) return response;
        const scope = await loadResourceScope(user.id);
        if (scope.error) return errorJson(500, scope.error);
        const body = await safeJson(request);
        let q = sb
          .from("leave_requests")
          .update(apiToRow(body) as any)
          .eq("id", params.id);
        if (!scope.isPrivileged) q = q.eq("user_id", user.id);
        const { data, error } = await q
          .select("*, employee:employees(name, department)")
          .maybeSingle();
        if (error) return errorJson(500, error.message);
        if (!data) return errorJson(404, "Not found");
        return json(flatten(data));
      },
      DELETE: async ({ request, params }) => {
        const { user, response } = await requireHrmAccess(request);
        if (!user) return response;
        const scope = await loadResourceScope(user.id);
        if (scope.error) return errorJson(500, scope.error);
        let q = sb.from("leave_requests").delete().eq("id", params.id);
        if (!scope.isPrivileged) q = q.eq("user_id", user.id);
        const { data, error } = await q.select("id").maybeSingle();
        if (error) return errorJson(500, error.message);
        if (!data) return errorJson(404, "Not found");
        return json({ ok: true });
      },
    },
  },
});
