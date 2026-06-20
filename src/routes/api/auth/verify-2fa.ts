import { createFileRoute } from "@tanstack/react-router";
import { errorJson, getBearerUser, json, loadUserShape } from "../_auth-helpers";
import { verifyTotp } from "./_totp";
import { getUserSetting } from "./_user-settings";

export const Route = createFileRoute("/api/auth/verify-2fa")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const user = await getBearerUser(request);
        if (!user) return errorJson(401, "Unauthorized");

        let body: { token?: string };
        try { body = await request.json(); } catch { return errorJson(400, "Invalid JSON"); }
        const token = (body.token ?? "").trim();
        if (!/^\d{6}$/.test(token)) return errorJson(400, "Enter the 6-digit code");

        const secret = await getUserSetting<string>(user.id, "two_factor_secret");
        if (!secret) return errorJson(400, "2FA not enabled for this account");

        const ok = await verifyTotp(secret, token);
        if (!ok) return errorJson(400, "Invalid code");

        const shape = await loadUserShape(user.id, user.email ?? "");
        return json({ message: "Verified", user: shape });
      },
    },
  },
});
