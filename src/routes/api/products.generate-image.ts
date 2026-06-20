import { createFileRoute } from "@tanstack/react-router";
import { requireUser, json } from "./_resource-helpers";
import { generateAndStoreProductImage } from "./_image-gen";

export const Route = createFileRoute("/api/products/generate-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireUser(request);
        if (auth.response) return auth.response;
        const body = await request.json().catch(() => ({} as any));
        const result = await generateAndStoreProductImage(auth.user.id, {
          name: body.name,
          category: body.category,
          description: body.description,
          brand: body.brand,
          unit: body.unit,
        });
        if ("error" in result) return json({ message: result.error }, { status: result.status });
        return json(result);
      },
    },
  },
});
