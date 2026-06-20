import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { json } from "../_auth-helpers";
import { requireAdmin } from "./_admin-guard";

export const Route = createFileRoute("/api/auth/admin/users")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (auth.response) return auth.response;

        const { data: profiles, error } = await supabaseAdmin
          .from("profiles")
          .select("id,auth_id,name,email,is_locked,must_change_password,two_factor_enabled,created_at")
          .order("created_at", { ascending: false });
        if (error) return json({ message: error.message }, { status: 500 });

        const authIds = (profiles ?? []).map((p: any) => p.auth_id).filter(Boolean);
        const { data: roleRows } = await supabaseAdmin
          .from("user_roles")
          .select("user_id,role")
          .in("user_id", authIds.length ? authIds : ["00000000-0000-0000-0000-000000000000"]);
        const roleMap = new Map<string, string>();
        for (const r of roleRows ?? []) if (!roleMap.has(r.user_id)) roleMap.set(r.user_id, r.role);

        return json((profiles ?? []).map((p: any) => ({
          id: Number(p.id),
          authId: p.auth_id,
          name: p.name,
          email: p.email,
          role: roleMap.get(p.auth_id) ?? "user",
          twoFactorEnabled: !!p.two_factor_enabled,
          isLocked: !!p.is_locked,
          mustChangePassword: !!p.must_change_password,
          createdAt: p.created_at,
        })));
      },
    },
  },
});
