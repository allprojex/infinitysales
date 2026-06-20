import { createFileRoute } from "@tanstack/react-router";
import { sb, requireAdmin, json } from "../_resource-helpers";

export const Route = createFileRoute("/api/admin/ip-blocks")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (auth.response) return auth.response;
        const { data, error } = await sb.from("ip_blocks").select("*").eq("user_id", auth.user.id).order("created_at", { ascending: false });
        if (error) return json({ message: error.message }, { status: 500 });
        return json((data ?? []).map((r: any) => ({
          id: r.id, ipAddress: r.ip_address, reason: r.reason,
          failedAttempts: r.failed_attempts, createdAt: r.created_at,
        })));
      },
      POST: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (auth.response) return auth.response;
        const body = await request.json().catch(() => ({}));
        if (!body.ipAddress) return json({ message: "ipAddress required" }, { status: 400 });
        const { data, error } = await sb.from("ip_blocks").upsert(
          { user_id: auth.user.id, ip_address: body.ipAddress, reason: body.reason ?? "manual_block" },
          { onConflict: "user_id,ip_address" },
        ).select("*").single();
        if (error) return json({ message: error.message }, { status: 500 });
        return json({ id: data.id, ipAddress: data.ip_address });
      },
    },
  },
});
