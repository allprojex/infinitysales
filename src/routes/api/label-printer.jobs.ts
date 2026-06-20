import { createFileRoute } from "@tanstack/react-router";
import { sb, requireUser, safeJson, parseQuery, json } from "./_resource-helpers";

export const Route = createFileRoute("/api/label-printer/jobs")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireUser(request);
        if (auth.response) return auth.response;
        const { limit } = parseQuery(request);
        const { data, error } = await sb
          .from("label_print_jobs")
          .select("*")
          .eq("user_id", auth.user.id)
          .order("created_at", { ascending: false })
          .limit(limit);
        if (error) return json({ message: error.message }, { status: 500 });
        return json(
          (data || []).map((r: any) => ({
            id: r.id,
            printerId: r.printer_id,
            printerName: r.printer_name,
            labelType: r.label_type,
            copies: r.copies,
            status: r.status,
            payload: r.payload,
            createdAt: r.created_at,
          })),
        );
      },
      POST: async ({ request }) => {
        const auth = await requireUser(request);
        if (auth.response) return auth.response;
        const body = await safeJson(request);
        const { data, error } = await sb
          .from("label_print_jobs")
          .insert({
            user_id: auth.user.id,
            printer_id: body.printerId ?? null,
            printer_name: body.printerName ?? null,
            label_type: body.labelType ?? null,
            copies: Number(body.copies ?? 1),
            status: body.status ?? "completed",
            payload: body.payload ?? body ?? {},
          })
          .select("*")
          .single();
        if (error) return json({ message: error.message }, { status: 500 });
        return json({ success: true, job: data }, { status: 201 });
      },
    },
  },
});
