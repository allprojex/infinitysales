import { createFileRoute } from "@tanstack/react-router";
import { errorJson, json, requireUser, safeJson, sb } from "./_resource-helpers";
import { globalUserPermissions, isPermissionKey } from "./-permission-helpers";
import { mergeSettingsPatch } from "./-settings-helpers";

export const Route = createFileRoute("/api/settings")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const { data, error } = await sb
          .from("user_settings")
          .select("data")
          .eq("user_id", user.id)
          .maybeSingle();
        if (error) return errorJson(500, error.message);
        const own =
          data?.data && typeof data.data === "object" && !Array.isArray(data.data)
            ? (data.data as Record<string, unknown>)
            : {};
        const { data: roles } = await sb.from("user_roles").select("role").eq("user_id", user.id);
        if ((roles ?? []).some((row) => row.role === "admin")) return json(own);
        try {
          return json({ ...own, ...(await globalUserPermissions()) });
        } catch (permissionError) {
          return errorJson(
            500,
            permissionError instanceof Error ? permissionError.message : "Permission load failed",
          );
        }
      },
      PUT: async ({ request }) => {
        const { user, response } = await requireUser(request);
        if (!user) return response;
        const body = await safeJson(request);
        const { data: roles } = await sb.from("user_roles").select("role").eq("user_id", user.id);
        const isAdmin = (roles ?? []).some((row) => row.role === "admin");
        const safeBody = isAdmin
          ? body
          : Object.fromEntries(Object.entries(body).filter(([key]) => !isPermissionKey(key)));
        const { data: existing } = await sb
          .from("user_settings")
          .select("data")
          .eq("user_id", user.id)
          .maybeSingle();
        const merged = mergeSettingsPatch(
          existing?.data && typeof existing.data === "object" && !Array.isArray(existing.data)
            ? (existing.data as Record<string, unknown>)
            : {},
          safeBody,
        );
        const { data, error } = await sb
          .from("user_settings")
          .upsert({ user_id: user.id, data: merged } as any, { onConflict: "user_id" })
          .select("data")
          .single();
        if (error) return errorJson(500, error.message);
        return json(data.data ?? {});
      },
    },
  },
});
