import { createFileRoute } from "@tanstack/react-router";
import { sb, requireUser, json } from "./_resource-helpers";

// Map entity_type -> destination table. Only entities we can safely restore.
const TABLE_MAP: Record<string, string> = {
  product: "products",
  customer: "customers",
  supplier: "suppliers",
  branch: "branches",
  warehouse: "warehouses",
  contact: "contacts",
};

export const Route = createFileRoute("/api/recycle-bin/$id/restore")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireUser(request);
        if (auth.response) return auth.response;

        const itemId = Number(params.id);
        const { data: item, error } = await sb
          .from("recycle_bin")
          .select("*")
          .eq("user_id", auth.user.id)
          .eq("id", itemId)
          .maybeSingle();
        if (error || !item) return json({ message: "Not found" }, { status: 404 });

        const table = TABLE_MAP[item.entity_type];
        if (!table) {
          await sb.from("recycle_bin").delete().eq("id", itemId);
          return json({ success: true });
        }

        const data: Record<string, any> = { ...((item.entity_data as Record<string, any>) || {}), user_id: auth.user.id };
        delete data.id;
        const { error: insErr } = await (sb as any).from(table).insert(data);
        if (insErr) return json({ message: insErr.message }, { status: 500 });

        await sb.from("recycle_bin").delete().eq("id", itemId);
        return json({ success: true });
      },
    },
  },
});
