import { createFileRoute } from "@tanstack/react-router";
import { json, requireAdmin } from "./-security._helpers";

export const Route = createFileRoute("/api/security/phishing-check")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (auth.response) return auth.response;
        const body = await request.json().catch(() => ({}));
        const input = String(body.input ?? "").trim();
        const flags: string[] = [];
        let heuristicScore = 0;
        if (/https?:\/\/[^/\s]*([0-9]{1,3}\.){3}[0-9]{1,3}/i.test(input)) {
          flags.push("URL uses an IP address instead of a domain");
          heuristicScore += 25;
        }
        if (/\.(tk|zip|mov|click|work|top)(\/|$)/i.test(input)) {
          flags.push("URL uses a commonly abused top-level domain");
          heuristicScore += 20;
        }
        if (/(password|verify|urgent|suspend|wallet|bank|otp|login)/i.test(input)) {
          flags.push("Text contains account-security urgency keywords");
          heuristicScore += 20;
        }
        if (/(paypa1|micros0ft|g00gle|faceb00k|whats-app)/i.test(input)) {
          flags.push("Text contains a lookalike brand/domain pattern");
          heuristicScore += 35;
        }
        heuristicScore = Math.min(100, heuristicScore);
        const riskLevel = heuristicScore >= 60 ? "high" : heuristicScore >= 30 ? "medium" : "low";
        return json({
          riskLevel,
          combinedScore: heuristicScore,
          heuristicScore,
          flags,
          aiRiskLevel: "not_configured",
          aiVerdict:
            riskLevel === "low"
              ? "No strong phishing indicators found."
              : "Potential phishing indicators found.",
          aiExplanation: "Heuristic analysis completed using the configured local checks.",
        });
      },
    },
  },
});
