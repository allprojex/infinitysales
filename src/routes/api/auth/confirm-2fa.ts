import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { errorJson, getBearerUser, json, loadUserShape } from "../_auth-helpers";
import { verifyTotp } from "./_totp";
import { getUserSetting, setUserSettings } from "./_user-settings";

export const Route = createFileRoute("/api/auth/confirm-2fa")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const user = await getBearerUser(request);
        if (!user) return errorJson(401, "Unauthorized");

        let body: { token?: string };
        try { body = await request.json(); } catch { return errorJson(400, "Invalid JSON"); }
        const token = (body.token ?? "").trim();
        if (!/^\d{6}$/.test(token)) return errorJson(400, "Enter the 6-digit code");

        const secret = await getUserSetting<string>(user.id, "pending_2fa_secret");
        if (!secret) return errorJson(400, "No pending 2FA setup found. Restart enrollment.");

        const ok = await verifyTotp(secret, token);
        if (!ok) return errorJson(400, "Invalid code. Try again.");

        await setUserSettings(user.id, {
          two_factor_secret: secret,
          pending_2fa_secret: null,
        });
        await supabaseAdmin
          .from("profiles")
          .update({ two_factor_enabled: true })
          .eq("auth_id", user.id);

        const shape = await loadUserShape(user.id, user.email ?? "");
        return json({
          message: "2FA enabled",
          accessToken: null,
          refreshToken: null,
          user: shape,
        });
      },
    },
  },
});
