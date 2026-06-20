# E2E Smoke Test Plan — Built `dist/` Output

Verify the production Nitro build serves the app, authenticates a user, renders core module routes (Sales, Inventory, CRM, Admin), and successfully calls backend APIs.

## 1. Serve the built output

- Start the Nitro server from `dist/server/index.mjs` on a free port (e.g. 3000) in the background, with required env vars (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, etc.) loaded from `.env`.
- Wait for readiness with a `curl` poll against `/`.

## 2. Playwright smoke script (`/tmp/browser/smoke/run.py`)

Headless Chromium, viewport 1280×1800. Pre-seed Supabase session into `localStorage` using `LOVABLE_BROWSER_SUPABASE_*` env vars so we skip interactive login but still validate the auth-gated subtree.

Steps, with a screenshot + console-error capture at each:

| # | Module        | Route                  | Assertion                                                              |
|---|---------------|------------------------|------------------------------------------------------------------------|
| 1 | Login flow    | `/login`               | Page renders without session; redirects to `/dashboard` once seeded    |
| 2 | Dashboard     | `/dashboard`           | Auth gate passes, KPI widgets mount, no 401/500 in network            |
| 3 | Sales         | `/sales`               | Table loads, `GET /api/sales` returns 200                              |
| 4 | Inventory     | `/products`            | Product list renders, `GET /api/products` 200                          |
| 5 | CRM           | `/customers`           | Customer list renders, `GET /api/customers` 200                        |
| 6 | Admin         | `/admin-settings`      | Admin panel renders (or 403 with proper message if non-admin user)     |

For each step record: final URL, HTTP status of primary API call, count of console errors, screenshot path.

## 3. Pass / fail criteria

- **Pass:** every route returns 200, no uncaught console errors, no failed (4xx/5xx) requests to `/api/*` other than the documented admin 403.
- **Fail:** any 500, blank page (no `<main>` content), or unhandled console exception → capture the trace, screenshot, and surface in the final report.

## 4. Cleanup

- Kill background Nitro process.
- Leave screenshots under `/tmp/browser/smoke/screenshots/` for inspection.

## 5. Deliverable

Single completion report listing, per module: route, HTTP status, console-error count, screenshot reference, and overall ready/not-ready verdict for the `dist/` build.

## Notes / out of scope

- No code changes. Read-only verification only.
- No CSV/XLSX upload re-test, no payment flows — those are explicitly out of scope per prior turns.
- If `LOVABLE_BROWSER_SUPABASE_SESSION_JSON` is absent in the sandbox, fall back to UI login using credentials supplied by the user (will pause and ask).
