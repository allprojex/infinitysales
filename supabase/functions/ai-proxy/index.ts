// External-facing AI proxy.
// External hosts call this function with header `x-proxy-key: <AI_PROXY_SECRET>`.
// The function forwards the request to the Lovable AI Gateway using the
// server-side LOVABLE_API_KEY (which is never exposed to the caller).
//
// Supported paths (appended to the function URL):
//   POST /chat/completions      -> https://ai.gateway.lovable.dev/v1/chat/completions
//   POST /images/generations    -> https://ai.gateway.lovable.dev/v1/images/generations
//   POST /embeddings            -> https://ai.gateway.lovable.dev/v1/embeddings
//
// Streaming (SSE) is passed through transparently when the upstream response
// is text/event-stream (e.g. chat with `stream: true`, image gen with
// `stream: true`).

const GATEWAY_BASE = "https://ai.gateway.lovable.dev/v1";

const ALLOWED_PATHS = new Set([
  "/chat/completions",
  "/images/generations",
  "/embeddings",
]);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-proxy-key, x-client-info, apikey, content-type",
  "Access-Control-Max-Age": "86400",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const proxySecret = Deno.env.get("AI_PROXY_SECRET");

  if (!lovableKey) {
    return json(500, { error: "Server misconfigured: missing LOVABLE_API_KEY" });
  }
  if (!proxySecret) {
    return json(500, { error: "Server misconfigured: missing AI_PROXY_SECRET" });
  }

  // External-caller auth via shared secret header.
  const presented = req.headers.get("x-proxy-key") ?? "";
  if (!presented || !timingSafeEqual(presented, proxySecret)) {
    return json(401, { error: "Unauthorized" });
  }

  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  // Resolve the upstream path. The function is mounted at /ai-proxy, so
  // anything after that segment becomes the upstream subpath.
  const url = new URL(req.url);
  const idx = url.pathname.indexOf("/ai-proxy");
  const subPath = idx >= 0 ? url.pathname.slice(idx + "/ai-proxy".length) : "";
  const normalized = subPath === "" || subPath === "/"
    ? "/chat/completions"
    : subPath;

  if (!ALLOWED_PATHS.has(normalized)) {
    return json(404, {
      error: `Unsupported path: ${normalized}`,
      allowed: Array.from(ALLOWED_PATHS),
    });
  }

  // Forward the body as-is; surface JSON validation errors clearly.
  const rawBody = await req.text();
  if (!rawBody) {
    return json(400, { error: "Empty request body" });
  }
  try {
    JSON.parse(rawBody);
  } catch {
    return json(400, { error: "Request body must be valid JSON" });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${GATEWAY_BASE}${normalized}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: rawBody,
    });
  } catch (err) {
    console.error("ai-proxy upstream fetch failed", err);
    return json(502, { error: "Upstream gateway request failed" });
  }

  // Pass through streaming responses (SSE) unchanged.
  const contentType = upstream.headers.get("content-type") ?? "";
  if (contentType.includes("text/event-stream") && upstream.body) {
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        ...corsHeaders,
      },
    });
  }

  // Non-streaming: forward body + status, attach CORS headers.
  const respBody = await upstream.text();

  // Detect AUTH failures (401/403) — likely a stale/invalid LOVABLE_API_KEY.
  // Record an alert row so admins see an in-app banner.
  if (upstream.status === 401 || upstream.status === 403) {
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (supabaseUrl && serviceKey) {
        await fetch(`${supabaseUrl}/rest/v1/ai_key_alerts`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            Prefer: "return=minimal",
          },
          body: JSON.stringify({
            source: `ai-proxy${normalized}`,
            upstream_status: upstream.status,
            error_excerpt: respBody.slice(0, 500),
          }),
        });
      }
    } catch (logErr) {
      console.error("ai-proxy: failed to record key alert", logErr);
    }
  }

  return new Response(respBody, {
    status: upstream.status,
    headers: {
      "Content-Type": contentType || "application/json",
      ...corsHeaders,
    },
  });
});
