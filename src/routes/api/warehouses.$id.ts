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
import { warehouseTotals } from "./-stock-helpers";

// Warehouses are a shared business directory (see warehouses.ts) -- reads are
// open to every authenticated account; only privileged roles (or the
// creator) may edit/delete, mirroring branches.$id.ts.
export const Route = createFileRoute("/api/warehouses/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const { data, error } = await sb
          .from("warehouses")
          .select("*")
          .eq("id", Number(params.id))
          .maybeSingle();
        if (error) return errorJson(500, error.message);
        if (!data) return errorJson(404, "Not found");
        const totals = await warehouseTotals(user.id);
        if (totals.error) return errorJson(500, totals.error);
        return json({
          ...rowToApi(data),
          ...(totals.totals.get(String((data as any).uuid_id ?? data.id)) ?? {
            totalUnits: 0,
            productCount: 0,
          }),
        });
      },
      PUT: async ({ request, params }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const scope = await loadResourceScope(user.id);
        if (scope.error) return errorJson(500, scope.error);
        const body = await safeJson(request);
        let q = sb
          .from("warehouses")
          .update(apiToRow(body) as any)
          .eq("id", Number(params.id));
        if (!scope.isPrivileged) q = q.eq("user_id", user.id);
        const { data, error } = await q.select("*").maybeSingle();
        if (error) return errorJson(500, error.message);
        if (!data) return errorJson(404, "Warehouse not found");
        if ((data as any).is_default) {
          // Exactly one warehouse may be the default at a time, across the
          // whole shared directory.
          const { error: unsetError } = await sb
            .from("warehouses")
            .update({ is_default: false } as any)
            .neq("id", Number(params.id));
          if (unsetError) return errorJson(500, unsetError.message);
        }
        return json(rowToApi(data));
      },
      DELETE: async ({ request, params }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const scope = await loadResourceScope(user.id);
        if (scope.error) return errorJson(500, scope.error);
        let q = sb.from("warehouses").delete().eq("id", Number(params.id));
        if (!scope.isPrivileged) q = q.eq("user_id", user.id);
        const { data, error } = await q.select("id").maybeSingle();
        if (error) return errorJson(500, error.message);
        if (!data) return errorJson(404, "Warehouse not found");
        return json({ ok: true });
      },
    },
  },
});
