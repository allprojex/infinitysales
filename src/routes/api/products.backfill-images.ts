import { createFileRoute } from "@tanstack/react-router";
import { requireUser, json, sb } from "./_resource-helpers";
import { generateAndStoreProductImage } from "./_image-gen";

const BATCH = 5; // per request

export const Route = createFileRoute("/api/products/backfill-images")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireUser(request);
        if (auth.response) return auth.response;

        // Count remaining missing-image products for this user.
        const { count: totalMissing } = await sb
          .from("products")
          .select("id", { count: "exact", head: true })
          .eq("user_id", auth.user.id)
          .or("image_url.is.null,image_url.eq.");

        // Fetch a batch.
        const { data: rows, error } = await sb
          .from("products")
          .select("id,name,category,description,brand,unit")
          .eq("user_id", auth.user.id)
          .or("image_url.is.null,image_url.eq.")
          .order("created_at", { ascending: true })
          .limit(BATCH);
        if (error) return json({ message: error.message }, { status: 500 });

        let processed = 0;
        const failures: { id: string; error: string }[] = [];
        for (const p of rows ?? []) {
          const res = await generateAndStoreProductImage(auth.user.id, {
            name: (p as any).name,
            category: (p as any).category,
            description: (p as any).description,
            brand: (p as any).brand,
            unit: (p as any).unit,
          });
          if ("error" in res) {
            failures.push({ id: (p as any).id, error: res.error });
            continue;
          }
          const { error: updErr } = await sb
            .from("products")
            .update({ image_url: res.imageUrl } as any)
            .eq("user_id", auth.user.id)
            .eq("id", (p as any).id);
          if (updErr) failures.push({ id: (p as any).id, error: updErr.message });
          else processed++;
        }

        const remaining = Math.max((totalMissing ?? 0) - processed, 0);
        return json({ processed, remaining, failures, batchSize: rows?.length ?? 0 });
      },
    },
  },
});
