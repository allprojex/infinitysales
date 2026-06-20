// Server-only helpers: generate product images via OpenAI (with Lovable AI fallback)
// and store in product-images bucket.
import { sb } from "./_resource-helpers";

const SIGNED_URL_TTL = 60 * 60 * 24 * 365; // 1 year

export type ProductImageInput = {
  name: string;
  category?: string | null;
  description?: string | null;
  brand?: string | null;
  unit?: string | null;
};

export function buildPrompt(p: ProductImageInput): string {
  const bits = [
    `Professional retail product photo of "${p.name}"`,
    p.brand ? `brand: ${p.brand}` : null,
    p.category ? `category: ${p.category}` : null,
    p.unit ? `packaging/size: ${p.unit}` : null,
    p.description ? `details: ${p.description}` : null,
    "centered, studio lighting, clean white background, sharp focus, high detail, e-commerce style, no text, no watermark",
  ].filter(Boolean);
  return bits.join(", ").slice(0, 900);
}

type GenResult = { bytes: Uint8Array } | { error: string; status: number };

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function generateWithOpenAI(prompt: string): Promise<GenResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { error: "OpenAI API key not configured", status: 503 };

  let resp: Response;
  try {
    resp = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt,
        n: 1,
        size: "1024x1024",
      }),
    });
  } catch (e: any) {
    return { error: `OpenAI request failed: ${e?.message ?? "network error"}`, status: 502 };
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    return { error: `OpenAI ${resp.status}: ${text.slice(0, 300)}`, status: 502 };
  }

  const data: any = await resp.json().catch(() => ({}));
  const b64: string | undefined = data?.data?.[0]?.b64_json;
  const remoteUrl: string | undefined = data?.data?.[0]?.url;

  if (b64) return { bytes: b64ToBytes(b64) };
  if (remoteUrl) {
    const dl = await fetch(remoteUrl);
    if (!dl.ok) return { error: `Failed to download OpenAI image (${dl.status})`, status: 502 };
    return { bytes: new Uint8Array(await dl.arrayBuffer()) };
  }
  return { error: "OpenAI returned no image data", status: 502 };
}

async function generateWithLovableAI(prompt: string): Promise<GenResult> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return { error: "LOVABLE_API_KEY not configured", status: 503 };

  let resp: Response;
  try {
    resp = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [{ role: "user", content: prompt }],
        modalities: ["image", "text"],
      }),
    });
  } catch (e: any) {
    return { error: `Lovable AI request failed: ${e?.message ?? "network error"}`, status: 502 };
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    let status = 502;
    if (resp.status === 429) status = 429;
    else if (resp.status === 402) status = 402;
    if (resp.status === 401 || resp.status === 403) {
      try {
        await (sb as any).from("ai_key_alerts").insert({
          source: "image-gen/lovable-ai",
          upstream_status: resp.status,
          error_excerpt: text.slice(0, 500),
        });
      } catch (e) {
        console.error("[image-gen] failed to record key alert", e);
      }
    }
    return { error: `Lovable AI ${resp.status}: ${text.slice(0, 300)}`, status };
  }

  const data: any = await resp.json().catch(() => ({}));
  const b64: string | undefined = data?.data?.[0]?.b64_json;
  const remoteUrl: string | undefined = data?.data?.[0]?.url;

  if (b64) return { bytes: b64ToBytes(b64) };
  if (remoteUrl) {
    const dl = await fetch(remoteUrl);
    if (!dl.ok) return { error: `Failed to download Lovable AI image (${dl.status})`, status: 502 };
    return { bytes: new Uint8Array(await dl.arrayBuffer()) };
  }
  return { error: "Lovable AI returned no image data", status: 502 };
}

export async function generateAndStoreProductImage(
  userId: string,
  input: ProductImageInput,
): Promise<{ imageUrl: string } | { error: string; status: number }> {
  if (!input.name || input.name.trim().length < 1) {
    return { error: "Product name is required", status: 400 };
  }
  const prompt = buildPrompt(input);

  // Try OpenAI first; on any failure fall back to Lovable AI.
  let result = await generateWithOpenAI(prompt);
  if ("error" in result) {
    console.warn("[image-gen] OpenAI failed, falling back to Lovable AI:", result.error);
    const fallback = await generateWithLovableAI(prompt);
    if ("error" in fallback) {
      console.error("[image-gen] Lovable AI fallback also failed:", fallback.error);
      return fallback;
    }
    result = fallback;
  }

  const bytes = result.bytes;
  const path = `${userId}/${crypto.randomUUID()}.png`;
  const { error: upErr } = await (sb as any).storage
    .from("product-images")
    .upload(path, bytes, { contentType: "image/png", upsert: false });
  if (upErr) return { error: `Storage upload failed: ${upErr.message}`, status: 500 };

  const { data: signed, error: signErr } = await (sb as any).storage
    .from("product-images")
    .createSignedUrl(path, SIGNED_URL_TTL);
  if (signErr || !signed?.signedUrl) {
    return { error: `Signing URL failed: ${signErr?.message ?? "unknown"}`, status: 500 };
  }
  return { imageUrl: signed.signedUrl };
}
