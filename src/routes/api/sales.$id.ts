import { createFileRoute } from "@tanstack/react-router";
import {
  errorJson,
  json,
  loadResourceScope,
  requireUser,
  rowToApi,
  safeJson,
  sb,
} from "./_resource-helpers";

// Sales previously ignored loadResourceScope entirely (unlike expenses.ts),
// hardcoding every read/write to the calling account's own user_id. That
// meant the business owner (admin) could never see a sale a cashier rang
// up, and vice versa -- confirmed live via a cashier account whose sale was
// invisible on the admin's own /sales list. Privileged roles now see every
// sale; everyone else still only sees their own.
export const Route = createFileRoute("/api/sales/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const scope = await loadResourceScope(user.id);
        if (scope.error) return errorJson(500, scope.error);
        let q = sb.from("sales").select("*").eq("id", params.id);
        if (!scope.isPrivileged) q = q.eq("user_id", user.id);
        const { data, error } = await q.maybeSingle();
        if (error) return errorJson(500, error.message);
        if (!data) return errorJson(404, "Not found");
        return json(rowToApi(data));
      },
      PUT: async ({ request, params }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const scope = await loadResourceScope(user.id);
        if (scope.error) return errorJson(500, scope.error);
        const body = await safeJson(request);
        const keys = Object.keys(body);
        if (keys.some((key) => key !== "notes")) {
          return errorJson(400, "Completed sale history is immutable; only notes may be edited");
        }
        if (!keys.length) return errorJson(400, "No note update was provided");
        let q = sb
          .from("sales")
          .update({ notes: body.notes == null ? null : String(body.notes) } as never)
          .eq("id", params.id);
        if (!scope.isPrivileged) q = q.eq("user_id", user.id);
        const { data, error } = await q.select("*").maybeSingle();
        if (error) return errorJson(500, error.message);
        if (!data) return errorJson(404, "Not found");
        return json(rowToApi(data));
      },
      DELETE: async ({ request, params }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        void params;
        return errorJson(
          405,
          "Sales are immutable and cannot be deleted; use an explicit void workflow",
        );
      },
    },
  },
});
