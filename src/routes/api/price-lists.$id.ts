import { createFileRoute } from "@tanstack/react-router";
import {
  apiToRow,
  errorJson,
  itemHandlers,
  json,
  requireUser,
  rowToApi,
  safeJson,
  sb,
} from "./_resource-helpers";

const generic = itemHandlers({ table: "price_lists" });

export const Route = createFileRoute("/api/price-lists/$id")({
  server: {
    handlers: {
      GET: generic.GET,
      PUT: async ({ request, params }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const body = await safeJson(request);
        const { data, error } = await sb
          .from("price_lists")
          .update(apiToRow(body) as never)
          .eq("user_id", user.id)
          .eq("id", params.id)
          .select("*")
          .single();
        if (error) return errorJson(500, error.message);

        // Exactly one price list may be the default at a time.
        if ((data as any)?.is_default) {
          const { error: unsetError } = await sb
            .from("price_lists")
            .update({ is_default: false } as never)
            .eq("user_id", user.id)
            .neq("id", params.id);
          if (unsetError) return errorJson(500, unsetError.message);
        }

        return json(rowToApi(data));
      },
      DELETE: generic.DELETE,
    },
  },
});
