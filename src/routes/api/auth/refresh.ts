import { createFileRoute } from "@tanstack/react-router";
import { createRequestAuthClient, errorJson, json } from "../_auth-helpers";

export const Route = createFileRoute("/api/auth/refresh")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { refreshToken?: string };
        try {
          body = await request.json();
        } catch {
          return errorJson(400, "Invalid JSON");
        }
        const refresh_token = body.refreshToken ?? "";
        if (!refresh_token) return errorJson(400, "Missing refreshToken");

        // Fresh, request-scoped client - see createRequestAuthClient for why
        // this must never be the shared supabaseAdmin singleton.
        const { data, error } = await createRequestAuthClient().auth.refreshSession({
          refresh_token,
        });
        if (error || !data.session)
          return errorJson(401, error?.message ?? "Invalid refresh token");

        return json({
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
        });
      },
    },
  },
});
