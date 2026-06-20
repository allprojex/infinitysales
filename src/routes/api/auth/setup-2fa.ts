import { createFileRoute } from "@tanstack/react-router";
import { errorJson, getBearerUser, json } from "../_auth-helpers";
import { generateBase32Secret, otpAuthUrl } from "./_totp";
import { setUserSettings } from "./_user-settings";

export const Route = createFileRoute("/api/auth/setup-2fa")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const user = await getBearerUser(request);
        if (!user) return errorJson(401, "Unauthorized");

        const secret = generateBase32Secret(20);
        const email = user.email ?? "user";
        const uri = otpAuthUrl(secret, email);

        await setUserSettings(user.id, { pending_2fa_secret: secret });

        return json({
          secret,
          otpauthUrl: uri,
          qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(uri)}`,
        });
      },
    },
  },
});
