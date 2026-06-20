import { createFileRoute } from "@tanstack/react-router";
import { sb, requireAdmin, json } from "./_resource-helpers";

// Auto-generates a small set of standard reports as DB records the user can review.
export const Route = createFileRoute("/api/admin/generated-reports/auto-generate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (auth.response) return auth.response;
        const now = new Date();
        const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

        const standard = [
          { type: "sales", title: `Sales Report — ${period}` },
          { type: "inventory", title: `Inventory Report — ${period}` },
          { type: "profit-loss", title: `Profit & Loss — ${period}` },
        ];

        let generated = 0;
        let skipped = 0;
        for (const r of standard) {
          const { data: existing } = await sb.from("generated_reports").select("id")
            .eq("user_id", auth.user.id).eq("type", r.type).eq("period", period).maybeSingle();
          if (existing) { skipped += 1; continue; }
          const { error } = await sb.from("generated_reports").insert({
            user_id: auth.user.id, type: r.type, title: r.title, period, status: "ready",
          });
          if (!error) generated += 1;
        }
        return json({ generated, skipped });
      },
    },
  },
});
