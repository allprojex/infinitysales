import { createFileRoute } from "@tanstack/react-router";
import { sb, requireUser, safeJson, json } from "./_resource-helpers";

export const Route = createFileRoute("/api/vat-report/rates")({
  server: {
    handlers: {
      PUT: async ({ request }) => {
        const auth = await requireUser(request);
        if (auth.response) return auth.response;
        const body = await safeJson(request);
        const row = {
          user_id: auth.user.id,
          vat_rate: Number(body.vatRate ?? 15),
          nhil_rate: Number(body.nhilRate ?? 2.5),
          getfund_rate: Number(body.getfundRate ?? 2.5),
          covid_levy: Number(body.covidLevy ?? 0),
        };
        const { data, error } = await sb
          .from("user_tax_rates")
          .upsert(row, { onConflict: "user_id" })
          .select("*")
          .single();
        if (error) return json({ message: error.message }, { status: 500 });
        return json({ success: true, rates: data });
      },
    },
  },
});
