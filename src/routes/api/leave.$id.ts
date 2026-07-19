import { createFileRoute } from "@tanstack/react-router";
import {
  apiToRow,
  errorJson,
  json,
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

export const Route = createFileRoute("/api/leave/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { user, response } = await requireHrmAccess(request);
        if (!user) return response;
        const { data, error } = await sb
          .from("leave_requests")
          .select("*, employee:employees(name, department)")
          .eq("user_id", user.id)
          .eq("id", params.id)
          .maybeSingle();
        if (error) return errorJson(500, error.message);
        if (!data) return errorJson(404, "Not found");
        return json(flatten(data));
      },
      PUT: async ({ request, params }) => {
        const { user, response } = await requireHrmAccess(request);
        if (!user) return response;
        const body = await safeJson(request);
        const { data, error } = await sb
          .from("leave_requests")
          .update(apiToRow(body) as any)
          .eq("user_id", user.id)
          .eq("id", params.id)
          .select("*, employee:employees(name, department)")
          .single();
        if (error) return errorJson(500, error.message);
        return json(flatten(data));
      },
      DELETE: async ({ request, params }) => {
        const { user, response } = await requireHrmAccess(request);
        if (!user) return response;
        const { error } = await sb
          .from("leave_requests")
          .delete()
          .eq("user_id", user.id)
          .eq("id", params.id);
        if (error) return errorJson(500, error.message);
        return json({ ok: true });
      },
    },
  },
});
