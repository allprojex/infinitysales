import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { json, pickHighestRole } from "../_auth-helpers";
import { requireAdmin } from "./_admin-guard";

type ProfileRow = {
  id: number;
  auth_id: string | null;
  name: string | null;
  email: string | null;
  is_locked: boolean | null;
  must_change_password: boolean | null;
  two_factor_enabled: boolean | null;
  created_at: string;
};

export const Route = createFileRoute("/api/auth/admin/users")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (auth.response) return auth.response;

        const { data: profiles, error } = await supabaseAdmin
          .from("profiles")
          .select(
            "id,auth_id,name,email,is_locked,must_change_password,two_factor_enabled,created_at",
          )
          .order("created_at", { ascending: false });
        if (error) return json({ message: error.message }, { status: 500 });

        const profileRows = (profiles ?? []) as ProfileRow[];
        const authIds = profileRows.map((p) => p.auth_id).filter(Boolean) as string[];
        const { data: roleRows } = await supabaseAdmin
          .from("user_roles")
          .select("user_id,role")
          .in("user_id", authIds.length ? authIds : ["00000000-0000-0000-0000-000000000000"]);
        const roleMap = new Map<string, string[]>();
        for (const r of roleRows ?? []) {
          roleMap.set(r.user_id, [...(roleMap.get(r.user_id) ?? []), r.role]);
        }

        return json(
          profileRows.map((p) => ({
            id: Number(p.id),
            authId: p.auth_id,
            name: p.name,
            email: p.email,
            role: pickHighestRole(roleMap.get(p.auth_id)),
            twoFactorEnabled: !!p.two_factor_enabled,
            isLocked: !!p.is_locked,
            mustChangePassword: !!p.must_change_password,
            createdAt: p.created_at,
          })),
        );
      },
    },
  },
});
