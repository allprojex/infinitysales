import { createFileRoute } from "@tanstack/react-router";
import { pickHighestRole } from "../_auth-helpers";
import { json, requireUser, sb } from "./_helpers";

type ProfileRow = {
  id: number;
  auth_id: string | null;
  name: string | null;
  email: string | null;
  two_factor_enabled?: boolean | null;
  is_locked?: boolean | null;
  created_at: string;
};

type RoleRow = { user_id: string; role: string };

function mapProfile(profile: ProfileRow, roleRows: RoleRow[]) {
  const role = pickHighestRole(
    roleRows.filter((r) => r.user_id === profile.auth_id).map((r) => r.role),
  );
  return {
    id: Number(profile.id),
    name: profile.name ?? profile.email ?? "User",
    email: profile.email ?? "",
    role,
    city: null,
    twoFactorEnabled: Boolean(profile.two_factor_enabled),
    isLocked: Boolean(profile.is_locked),
    createdAt: profile.created_at,
  };
}

export const Route = createFileRoute("/api/reports/users")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;

        const { data: callerRoles } = await sb
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id);
        const isAdmin = (callerRoles ?? []).some((r) => r.role === "admin");

        let profilesQuery = sb
          .from("profiles")
          .select("id,auth_id,name,email,two_factor_enabled,is_locked,created_at")
          .order("created_at", { ascending: false });
        if (!isAdmin) profilesQuery = profilesQuery.eq("auth_id", user.id);

        const { data: profiles, error } = await profilesQuery;
        if (error) return json({ message: error.message }, { status: 500 });

        const authIds = (profiles ?? []).map((p) => p.auth_id).filter(Boolean) as string[];
        const { data: roleRows } = authIds.length
          ? await sb.from("user_roles").select("user_id,role").in("user_id", authIds)
          : { data: [] };

        const users = (profiles ?? []).map((p) => mapProfile(p as ProfileRow, roleRows ?? []));
        return json({
          users,
          items: users,
          total: users.length,
          adminCount: users.filter((u) => u.role === "admin").length,
          userCount: users.filter((u) => u.role === "user").length,
          activeCount: users.filter((u) => !u.isLocked).length,
        });
      },
    },
  },
});
