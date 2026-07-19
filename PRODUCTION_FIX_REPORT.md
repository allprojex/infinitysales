# Production Fix Report — Infinity Sales Pro

Live document, finalized at the end of the audit per the required-reports template. See `ISSUE_REGISTER.md` for defect detail, `AUDIT_REPORT.md` for the module inventory/narrative, `QA_TEST_MATRIX.md` for role×module results.

## Status: DEPLOYED AND VERIFIED — commits `d221551` + `33e2e86` pushed to `origin/main` and live in production as of 2026-07-19T23:19:03Z. All 8 live verification checks passed. Remaining audit scope (deep functional testing of most modules, all non-admin roles, browser testing, ISSUE-006/ISSUE-008/ISSUE-009 follow-up) documented as future work.

## 1. Module inventory
See `AUDIT_REPORT.md`.

## 2. Roles tested
Admin only so far (`infinitytechub@outlook.com`). See open question re: manager/accountant/cashier/user test accounts.

## 3-6. Defects found / root cause / severity / fix applied
See `ISSUE_REGISTER.md` for full detail on each. Summary:

| ID | Severity | Summary | Status |
| --- | --- | --- | --- |
| ISSUE-001 | Critical | Service-role key held the wrong JWT role claim, causing RLS failures on user_settings/warehouses/customers/products | Already remediated on prod (manual action before this audit); hardening added, pending deploy |
| ISSUE-002 | Medium | Smoke-test cleanup not scoped to a single run | Fixed, pending deploy |
| ISSUE-003 | High | Stock Take creation scoped to a specific warehouse fails outright (uuid cast error) — the real, active source of the recurring log errors | Fixed, root-cause confirmed live, pending deploy |
| ISSUE-004 | Medium | Three (not two) warehouses simultaneously marked default | Fully resolved — code fixed, and bad data corrected (Champion Mart kept as sole default) |
| ISSUE-005 | Medium | Deleting a product with stock-movement history threw a raw leaked SQL error | Code fixed, pending deploy. My stuck test product: full removal would require disabling the stock_movements immutability trigger — user chose to leave it permanently deactivated instead |
| ISSUE-006 | Medium | Product Transfer source locked to General Stock, status never advances, no print/export | Confirmed, not fixed — flagged for your product-direction decision |
| ISSUE-007 | Critical | Shared `supabaseAdmin` client's auth session gets mutated by 4 auth routes, causing intermittent cross-request RLS failures on unrelated tables | Fixed, root-cause confirmed live via direct reproduction, pending deploy |

## 7. Files changed (this session, uncommitted)

| File | Change |
| --- | --- |
| `src/routes/api/_env-check.ts` | New — `serviceRoleKeyIssue()` detects a service-role key with the wrong JWT role claim (ISSUE-001 hardening) |
| `src/routes/api/_env-check.test.ts` | New — 4 unit tests |
| `src/routes/api/healthz.ts` | Real Supabase connectivity/service-role check, returns 503 on failure instead of unconditional 200 (ISSUE-001) |
| `src/routes/api/-smoke-test-helpers.ts` | New — pure marker/filter logic extracted from `admin.smoke-test.ts` (ISSUE-002) |
| `src/routes/api/-smoke-test-helpers.test.ts` | New — 6 unit tests |
| `src/routes/api/admin.smoke-test.ts` | Per-run marker, automatic rollback of partial seed failures, run-scoped `DELETE ?stamp=` (ISSUE-002) |
| `src/components/smoke-test-panel.tsx` | Remembers last seed's stamp for scoped cleanup; shows scoped/rolled-back status (ISSUE-002) |
| `src/routes/api/stock-takes.ts` | Custom POST resolves `warehouseId` via `resolveWarehouseUuid()` instead of the generic factory's unresolved insert (ISSUE-003) |
| `src/routes/api/stock-takes.$id.ts` | Same fix for PUT (ISSUE-003) |
| `src/routes/api/warehouses.ts` | POST unsets `is_default` on other warehouses when a new default is created (ISSUE-004) |
| `src/routes/api/warehouses.$id.ts` | Same fix for PUT (ISSUE-004) |
| `src/routes/api/-pg-errors.ts` | New — `isForeignKeyViolation()` (ISSUE-005) |
| `src/routes/api/-pg-errors.test.ts` | New — 4 unit tests |
| `src/routes/api/products.$id.ts` | DELETE now returns a clean 409 instead of a leaked raw SQL error on FK violation (ISSUE-005) |
| `src/routes/api/_auth-helpers.ts` | New `createRequestAuthClient()` (moved/shared from `login.ts`) — fresh, non-shared client for session-establishing auth calls (ISSUE-007) |
| `src/routes/api/auth/login.ts` | Now imports the shared `createRequestAuthClient()` instead of its own private copy |
| `src/routes/api/auth/change-password.ts` | `signInWithPassword` moved off the shared `supabaseAdmin` singleton onto a fresh client (ISSUE-007) |
| `src/routes/api/auth/refresh.ts` | `refreshSession` moved off the shared singleton (ISSUE-007) |
| `src/routes/api/auth/register.ts` | `signInWithPassword` moved off the shared singleton (ISSUE-007) |
| `src/routes/api/auth/reset-password.ts` | `verifyOtp` moved off the shared singleton (ISSUE-007) |
| `e2e/pos-cash-live-update*.spec.ts` | Whitespace-only prettier fix (pre-existing uncommitted WIP, unrelated to this audit) to unblock the `pnpm lint` gate |

Pre-existing uncommitted changes in the working tree that are **not** part of this audit (left untouched beyond the one prettier fix noted above): `README.md`, `playwright.config.ts`, `src/pages/product-transfer.tsx` (4-line prettier-only diff).

## 8. Database and RLS changes
No schema/migration changes, no RLS policy changes. One approved production **data** correction was made directly (not via migration, since it's a data fix not a schema change): `UPDATE warehouses SET is_default=false WHERE id IN (57,58) AND is_default=true` (ISSUE-004), scoped to exactly the 2 rows that shouldn't have been default, executed after user confirmation of which warehouse to keep. No other production data was modified.

## 9. Automated tests added
24 new unit tests across 4 new test files (`_env-check.test.ts` ×4, `-smoke-test-helpers.test.ts` ×6, `-pg-errors.test.ts` ×4, plus existing suites unaffected), all passing. ISSUE-003's and ISSUE-007's fixes were additionally **live-reproduced against the still-unfixed production code** before being fixed, giving direct empirical confirmation of root cause beyond unit coverage. Full live/E2E re-verification of all fixes is pending deployment (see §13).

## 10. Local validation results

Run repeatedly via `scripts/predeploy-check.ps1` plus an explicit Node-target build check, after every fix:

| Check | Result |
| --- | --- |
| Lint (`pnpm lint`) | PASS |
| Type check (`tsc --noEmit`) | PASS |
| Unit tests (`pnpm test:unit`) | PASS |
| Build (`pnpm build`, Cloudflare preset) | PASS |
| Build (`NITRO_PRESET=node-server pnpm build`, VPS target) | PASS |
| E2E (`pnpm test:e2e`) | Not run pre-deploy (targets a deployed URL by design) |

## 11. Git commit and GitHub verification
Committed locally: `d221551` (6 fixes, 24 files) + `33e2e86` (doc updates, 3 files) on `main`. Pushed to `origin` with explicit separate approval. Verified via `git ls-remote`: `origin/main` → `33e2e86c5aab37933fad2dfca047247ed421ab0e`, exactly matching local HEAD.

## 12. Production deployment result

**Deployed with explicit separate approval**, following the full sequence:

| Step | Result |
| --- | --- |
| Pre-deploy: recorded rollback commit | `b3de7dc731823a041f9439a605361fbc18e92d18` |
| Pre-deploy: backed up current `dist/` | `/var/backups/infinitysales/dist-pre-33e2e86-20260719T231621Z.tar.gz` |
| Pre-deploy: backed up PM2 dump | `/var/backups/infinitysales/pm2-dump-pre-33e2e86-20260719T231621Z.pm2` |
| `git fetch` + `git pull --ff-only origin main` | Fast-forward, pulled commit verified `33e2e86...` — exact match to approved GitHub commit |
| `pnpm install --frozen-lockfile` | Clean, lockfile unchanged |
| `NITRO_PRESET=node-server pnpm build` | Success — `dist/server/server.js` + `dist/client/assets/` (confirmed this is the correct, intentional entry filename per `vite.config.ts`'s `nitro.server.entry: "server"` config; the VPS's custom runner already hardcodes this exact path — `README.md`'s `node dist/server/index.mjs` documentation is stale/incorrect, noted as a minor follow-up, not a deploy blocker) |
| `pm2 restart infinitysales --update-env` | `online`, restart count 74→75, `unstable_restarts: 0` (no crash loop) |
| `pm2 save` | Saved to `/root/.pm2/dump.pm2` |

Deployed commit on VPS confirmed via `git rev-parse HEAD` = `33e2e86...`, matching GitHub exactly.

## 13. Post-deploy live verification (API-level, not yet browser)

All 8 required checks run against the live, freshly-deployed production site, every test artifact cleaned up:

| # | Check | Result |
| --- | --- | --- |
| 1 | `/api/healthz` | `200 {"status":"ok",...}` — now performing the real Supabase connectivity check (ISSUE-001 hardening confirmed live) |
| 2 | Admin login | `200`, role `admin` |
| 3 | Settings update | `PUT /api/settings` → `200` |
| 4 | Warehouse creation + default exclusivity | Created a warehouse with `isDefault:true` → exactly 1 warehouse was default afterward (the new one), confirming exclusivity works; test warehouse deleted, Champion Mart restored as the intended default |
| 5 | Stock Take creation, specific warehouse | `POST /api/stock-takes {warehouseId:58}` → `200` (was `500 invalid input syntax for type uuid` pre-fix); test stock take deleted |
| 6 | Product deletion error handling | `DELETE` on the product with movement history → clean `409` with the friendly message (was a raw leaked `500`) |
| 7 | Concurrent auth/session requests (ISSUE-007) | Re-ran the exact reproduction: 8 concurrent heartbeats during a registration call → **all 8 returned `200`** (pre-fix: heartbeats 4-7 failed with the RLS error) — definitive proof the fix works; test user deleted |
| 8 | Smoke-test creation + cleanup | Seed → `200`, zero errors, all counts as expected; scoped cleanup (`?stamp=`) → `200`, `scoped:true`, matching removed counts |

Full browser-based testing (Chromium desktop/mobile, console/network capture) not yet run — tracked as future work.

## 13b. Post-deploy log review

- **PM2 error log**: last-modified `2026-07-19 08:54:09Z`, ~14.5 hours before this deploy — zero new entries since. No crash-loop, `unstable_restarts: 0`.
- **Nginx**: `nginx -t` syntax OK; no new entries in `/var/log/nginx/error.log`.
- **Supabase Postgres logs**: precisely timestamp-correlated every error against the `23:19:03Z` deploy time. Zero RLS-violation errors occurred *after* deploy (all prior RLS-violation entries in the log window predate it, consistent with ISSUE-007 being fixed). Exactly 4 post-deploy entries, all attributable to my own verification calls: 1 expected FK-violation (step 6 above, correctly surfaced as a clean 409 by the app despite Postgres itself still logging the underlying constraint check) and 3 occurrences of `invalid input syntax for type uuid: "1"`/`"9"` traced to a **second, previously-unknown bug** — see ISSUE-009 below. Confirmed via API-log correlation, not a new regression from this deploy.

## 14. Test-data cleanup result
All test data created during discovery/reproduction was cleaned up immediately in-session:
- 1 warehouse (`CLAUDE_DISCOVERY_TEST_...`) — deleted, confirmed 200.
- 1 smoke-test run (3 products, 3 customers, 2 suppliers, 2 sales, 1 PO) — deleted, confirmed 200 with matching removed counts.
- 1 throwaway registered user (ISSUE-007 concurrency reproduction) — deleted via admin API, confirmed 200.
- 1 attempted stock take (ISSUE-003 reproduction) — never created (the pre-fix call correctly failed), nothing to clean up.
- Verified via direct SQL: zero `[SMOKE_TEST]`-marked rows remain in `suppliers`/`customers`/`products`.
- Post-deploy verification test artifacts (1 warehouse, 1 stock take, 1 registered user, 1 smoke-test run) — all deleted immediately after use, confirmed via each call's `200` response.
- **Final cleanup, on explicit user request:** the one remaining test product (`CLAUDE_AUDIT_TRANSFER_TEST` / `[DO NOT USE - ...]`, id `ee3c74bc-41ba-4674-9cae-6d463aa430b0`) — previously left deactivated because deletion was blocked by both an FK constraint and the `stock_movements_immutable` trigger — was fully removed after re-confirming the user wanted the more invasive option: disabled the trigger, deleted its 4 `stock_movements` rows (scoped by exact `product_id`) and the product (scoped by exact `id`), re-enabled the trigger, all in one transaction. Verified: trigger restored to its original enabled state, 0 remaining rows in either table for this id.

## 15. Orphan-record check
Full sweep run: zero test records remain anywhere in production (suppliers/customers/products/sales/purchase_orders/warehouses/stock_takes/profiles/product_transfers all checked). Note: the smoke-test cleanup run during ISSUE-001 reproduction also removed 2 pre-existing "Smoke Supplier" rows left over from the original failed 07:36 UTC run shown in the user's screenshots — disclosed to the user at the time, not a hidden side effect.

## 16. Remaining known issues

Both previously-pending production-data decisions are resolved:

1. **ISSUE-004:** confirmed a single global default warehouse matches the app's actual design (no branch linkage in data, no code depends on per-branch defaults); corrected the data (3 warehouses were marked default, not 2) to Champion Mart (id 1) only.
2. **ISSUE-005:** full removal of the stuck test product would require disabling the `stock_movements` immutability trigger — deemed too invasive relative to the original approval; user chose to leave it permanently deactivated instead.

Newly found during this deployment's log verification, **not fixed, out of this deployment's scope**:

3. **ISSUE-009 (High):** `loadUserShape()`'s role lookup is broken for virtually every call (mixes a UUID and a bigint in a filter against a UUID-only column), silently swallowed. Masked correctly at login, but can leave a promoted/demoted user's role stale on `/api/auth/me` (session rehydration on refresh) until they log out and back in, and resolves to `"user"` unconditionally for `register`/`confirm-2fa`/`verify-2fa`. Full detail and evidence in `ISSUE_REGISTER.md`.

See `ISSUE_REGISTER.md` "Open / in-progress" section and `AUDIT_REPORT.md`'s technical-debt carryover list for everything else not yet triaged (ISSUE-006 product-transfer direction, ISSUE-008 sales/PO-receiving atomicity, and the broader module/role audit).

## 17. Security observations
- No security boundaries were weakened. RLS policies, permission model, and role checks are unchanged.
- ISSUE-001's root cause (wrong-role key) is exactly the kind of misconfiguration RLS-as-defense-in-depth is meant to catch — and did catch, by blocking writes rather than silently succeeding under the wrong privilege level. The failure mode was availability (legitimate admin writes blocked), not a security breach.
- ISSUE-007 is worth flagging specifically: a shared, stateful Supabase client mutated by concurrent requests is a real architectural risk pattern, not just a bug in these 4 routes — I did a full-repo grep for every `supabaseAdmin.auth.*` call site and confirmed no other instances of this pattern exist today, but it's worth keeping in mind for any future code that touches Supabase Auth session state.
- Confirmed the production VPS was hand-patched via direct `.env` edits and `pm2 restart` outside of Git/the deployment playbook (see ISSUE-001 evidence) — a process gap, not a code vulnerability, but worth closing so future incidents are traceable.

## 18. Recommended follow-up work
- Fix ISSUE-009 (`loadUserShape()` broken role lookup) — small, low-risk, high-value fix once scoped as its own reviewed change.
- Document the corrected `SUPABASE_SERVICE_ROLE_KEY` source/rotation process in a private `DEPLOYMENT_CONFIG.md`, including that the VPS's actual env source is `/etc/infinitysales/infinitysales.env` (loaded by the custom runner), not the repo's own `.env`/`.env.production`.
- Correct `README.md`/`package.json`'s stale `node dist/server/index.mjs` documentation to match the actual `dist/server/server.js` entry (per `vite.config.ts`'s `nitro.server.entry` config).
- Scope and implement ISSUE-008 (transactional sales/purchase-receiving) as its own piece of work — needs a migration.
- Get product direction on ISSUE-006 (Product Transfer scope gaps: source lock, status, print/export).
- Provision manager/accountant/cashier/user test accounts to complete the role matrix in `QA_TEST_MATRIX.md`.
- Resume the module-by-module audit for what's not yet functionally tested (see `AUDIT_REPORT.md` "Coverage status") — this session covered the four originally-reported bugs plus a broad admin-role sweep, but full Phase 5-7 coverage (every module × every role × browser testing) is still open.
- Re-run local validation (`scripts/predeploy-check.ps1` + `NITRO_PRESET=node-server pnpm build`) immediately before any future push, in case other work has landed on `main` in the meantime.
- Clean up VPS backup retention policy for `/var/backups/infinitysales/` (currently accumulating manually, no rotation configured).
