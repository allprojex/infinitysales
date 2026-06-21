import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireAdmin, rowRole, sb } from "./-security._helpers";

export const Route = createFileRoute("/api/security/locked-users")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (auth.response) return auth.response;
        const [{ data: profiles, error: profilesError }, { data: roles, error: rolesError }] =
          await Promise.all([
            sb
              .from("profiles")
              .select("id,auth_id,name,email,is_locked")
              .eq("is_locked", true)
              .order("created_at", { ascending: false }),
            sb.from("user_roles").select("user_id,role"),
          ]);
        const error = profilesError ?? rolesError;
        if (error) return errorJson(500, error.message);
        return json(
          (profiles ?? []).map((p) => ({
            id: p.id,
            name: p.name,
            email: p.email,
            role: rowRole(roles, p.auth_id),
            failedLoginAttempts: 0,
          })),
        );
      },
    },
  },
});
