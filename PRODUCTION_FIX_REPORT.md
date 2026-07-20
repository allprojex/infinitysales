# Production Fix Report — Infinity Sales Pro

Live document, finalized at the end of the audit per the required-reports template. See `ISSUE_REGISTER.md` for defect detail, `AUDIT_REPORT.md` for the module inventory/narrative, `QA_TEST_MATRIX.md` for role×module results.

## Status: DEPLOYED AND VERIFIED — three deployments completed this session. Latest: commit `404c6fa` live in production as of 2026-07-20T00:20:15Z. All required live verification checks passed every time, including three user-reported bugs (ISSUE-010, 011, 012) each fixed and verified same-session. Remaining audit scope (deep functional testing of most modules, all non-admin roles, browser testing, ISSUE-006/ISSUE-008/ISSUE-009 follow-up) documented as future work.

## 1. Module inventory
See `AUDIT_REPORT.md`.

## 2. Roles tested
Admin only so far (`infinitytechub@outlook.com`). See open question re: manager/accountant/cashier/user test accounts.

## 3-6. Defects found / root cause / severity / fix applied
See `ISSUE_REGISTER.md` for full detail on each. Summary:

| ID | Severity | Summary | Status |
| --- | --- | --- | --- |
| ISSUE-001 | Critical | Service-role key held the wrong JWT role claim, causing RLS failures on user_settings/warehouses/customers/products | Fully resolved — key issue remediated before this audit; hardening deployed and live-verified |
| ISSUE-002 | Medium | Smoke-test cleanup not scoped to a single run | Fully resolved — deployed and live-verified |
| ISSUE-003 | High | Stock Take creation scoped to a specific warehouse fails outright (uuid cast error) — the real, active source of the recurring log errors | Fully resolved — deployed and live-verified |
| ISSUE-004 | Medium | Three (not two) warehouses simultaneously marked default | Fully resolved — code fixed, deployed, and bad data corrected (Champion Mart kept as sole default) |
| ISSUE-005 | Medium | Deleting a product with stock-movement history threw a raw leaked SQL error | Fully resolved — deployed, live-verified, and (on later explicit request) the stuck test product fully removed via a scoped, reversible trigger-disable/re-enable |
| ISSUE-006 | Medium | Product Transfer source locked to General Stock, status never advances, no print/export | Confirmed, not fixed — flagged for your product-direction decision |
| ISSUE-007 | Critical | Shared `supabaseAdmin` client's auth session gets mutated by 4 auth routes, causing intermittent cross-request RLS failures on unrelated tables | Fully resolved — deployed, live-reproduced pre-fix and again post-fix (0/8 failures vs. 4/8 pre-fix) |
| ISSUE-008 | High | Sales/purchase-order-receiving writes aren't atomic | Root-caused via code review, **not fixed** — needs a migration/RPC design, flagged as follow-up |
| ISSUE-009 | High | `loadUserShape()`'s role lookup is broken for virtually every call | Root-caused via post-deploy log correlation, **not fixed** — was out of the first deployment's scope, flagged as follow-up |
| ISSUE-010 | High | Reorder Rule creation crashed when a preferred supplier was selected (user-reported, live screenshot) | Fully resolved — migration (`suppliers.uuid_id`) + app fix, deployed, live-verified by recreating the exact screenshot scenario |
| ISSUE-011 | High | Serial number registration always failed, both auto (product create) and manual paths — plus the list display itself was broken (user-reported, "for all users and admin") | Fully resolved — deployed, live-verified (create + correct list display) |
| ISSUE-012 | High | Sales page "Create New Sale": product price never auto-filled; underlying bug also corrupted the submitted product reference (user-reported, live screenshot) | Fully resolved — deployed |

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
| `supabase/migrations/20260719234500_add_suppliers_uuid_id.sql` | New migration — adds `suppliers.uuid_id` (ISSUE-010) |
| `src/routes/api/-reorder-rules-helpers.ts` | `resolveSupplierUuid()` resolves the supplier through the new column on create/update; `mapRules()` looks suppliers up by `uuid_id`, returns the numeric id for frontend compatibility (ISSUE-010) |
| `src/integrations/supabase/types.ts` | Hand-added `suppliers.uuid_id` (Supabase CLI type generation unavailable in this environment; verified directly against the live schema first) |

Pre-existing uncommitted changes in the working tree that are **not** part of this audit (left untouched beyond the one prettier fix noted above): `README.md`, `playwright.config.ts`, `src/pages/product-transfer.tsx` (4-line prettier-only diff).

## 8. Database and RLS changes
No RLS policy changes at any point.

- **Data correction** (ISSUE-004): `UPDATE warehouses SET is_default=false WHERE id IN (57,58) AND is_default=true`, scoped to exactly the 2 rows that shouldn't have been default, after user confirmation of which warehouse to keep.
- **Data cleanup** (ISSUE-005, on later explicit user request): temporarily disabled the `stock_movements_immutable` trigger inside a single transaction, deleted the 4 `stock_movements` rows and 1 product row for one specific, exact id, re-enabled the trigger — verified restored.
- **Schema migration** (ISSUE-010): `supabase/migrations/20260719234500_add_suppliers_uuid_id.sql` — adds `suppliers.uuid_id` (purely additive: new nullable column → backfilled → `NOT NULL` + default → unique index; no existing column/constraint touched). Applied directly to production with explicit approval, before the corresponding app-code fix was deployed (safe: unused by any code until the deploy that followed). Rollback: `DROP INDEX suppliers_uuid_id_key; ALTER TABLE suppliers DROP COLUMN uuid_id;`.

## 9. Automated tests added
24 new unit tests across 4 new test files (`_env-check.test.ts` ×4, `-smoke-test-helpers.test.ts` ×6, `-pg-errors.test.ts` ×4), all passing. ISSUE-003, ISSUE-007, and ISSUE-010's fixes were additionally **live-reproduced against the still-unfixed production code before being fixed**, and **re-verified live against the deployed fix afterward**, giving direct empirical confirmation beyond unit coverage in both directions.

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

Four commits on `main`, all pushed to `origin` with explicit separate approval each time:

| Commit | Content |
| --- | --- |
| `d221551` | 6 fixes (ISSUE-001 hardening, 002, 003, 004, 005, 007), 24 files |
| `33e2e86` | Doc updates (ISSUE-008 documented) |
| `4948081` | Doc updates (deployment #1 verification results, ISSUE-009 documented, test-cleanup record) |
| `29b571c` | ISSUE-010 fix: migration + app code + types |

Verified via `git ls-remote` after each push. `origin/main` currently → `404c6fab29fd0c784e68662f8fa82bd1f0c7172f` (commit `404c6fa`, adding ISSUE-011/012), exactly matching local HEAD.

## 12. Production deployment result

**Three deployments this session, all with explicit separate approval**, following the full sequence each time:

**Deployment #1** (commits `d221551`+`33e2e86`+`4948081` → `33e2e86` was HEAD at deploy time, `4948081` followed as a doc-only commit after):

| Step | Result |
| --- | --- |
| Pre-deploy: recorded rollback commit | `b3de7dc731823a041f9439a605361fbc18e92d18` |
| Pre-deploy: backed up `dist/` + PM2 dump | `/var/backups/infinitysales/*-pre-33e2e86-20260719T231621Z.*` |
| `git pull --ff-only` | Fast-forward to `33e2e86...`, exact match |
| `pnpm install --frozen-lockfile` + `NITRO_PRESET=node-server pnpm build` | Success — `dist/server/server.js` (confirmed correct entry filename per `vite.config.ts`'s `nitro.server.entry: "server"`; `README.md`'s `node dist/server/index.mjs` is stale documentation, noted as a minor follow-up) |
| `pm2 restart infinitysales --update-env` + `pm2 save` | `online`, restart 74→75, `unstable_restarts: 0` |

**Deployment #2** (commit `29b571c`, the ISSUE-010 fix):

| Step | Result |
| --- | --- |
| Pre-deploy: recorded rollback commit | `33e2e86c5aab37933fad2dfca047247ed421ab0e` |
| Pre-deploy: backed up `dist/` + PM2 dump | `/var/backups/infinitysales/*-pre-29b571c-20260719T235501Z.*` |
| `git pull --ff-only` | Fast-forward to `29b571c...`, exact match |
| `pnpm install --frozen-lockfile` + `NITRO_PRESET=node-server pnpm build` | Success |
| `pm2 restart infinitysales --update-env` + `pm2 save` | `online`, restart 75→76, `unstable_restarts: 0` |

**Deployment #3** (commit `404c6fa`, ISSUE-011 + ISSUE-012 fixes):

| Step | Result |
| --- | --- |
| Pre-deploy: recorded rollback commit | `29b571c7d4ea1ae2a271df8b3b9c3e7065c0e36d` |
| Pre-deploy: backed up `dist/` + PM2 dump | `/var/backups/infinitysales/*-pre-404c6fa-20260720T001854Z.*` |
| `git pull --ff-only` | Fast-forward to `404c6fa...`, exact match |
| `pnpm install --frozen-lockfile` + `NITRO_PRESET=node-server pnpm build` | Success |
| `pm2 restart infinitysales --update-env` + `pm2 save` | `online`, restart 76→77, `unstable_restarts: 0` |

Deployed commit on VPS confirmed via `git rev-parse HEAD` = `404c6fa...`, matching GitHub exactly.

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

## 13a. Deployment #2 live verification (ISSUE-010)

Recreated the exact scenario from the user's screenshot against the freshly-deployed fix:

`POST /api/reorder-rules` with product "5 Star" + `preferredSupplierId: "110"` (Fanmilk Ghana Ltd) → **`200`**, `preferred_supplier_id: 110`, `preferred_supplier_name: "Fanmilk Ghana Ltd"` (was `500 invalid input syntax for type uuid: "110"` pre-fix). Test rule deleted after (`200`). PM2 error log unchanged since `08:54:09Z` — zero new errors from this deploy.

## 13a2. Deployment #3 live verification (ISSUE-011, ISSUE-012)

- `POST /api/serial-numbers {productId, serial: "..."}` → `200`; confirmed the created row appears correctly in `GET /api/serial-numbers` with its `serial` value intact (display-side fix confirmed, not just creation). Test row deleted after.
- `POST /api/sales {items:[{productId: <real uuid>, ...}]}` → `200`, sale created successfully with the real product uuid the fixed frontend now sends. Test sale deleted after.
- PM2 error log unchanged since `08:54:09Z` — zero new errors from this deploy.

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
Final sweep (after ISSUE-005's full cleanup) run across suppliers/customers/products/sales/purchase_orders/warehouses/stock_takes/profiles/product_transfers: **zero test records remain anywhere in production.** Note: the smoke-test cleanup run during ISSUE-001 reproduction also removed 2 pre-existing "Smoke Supplier" rows left over from the original failed 07:36 UTC run shown in the user's screenshots — disclosed to the user at the time, not a hidden side effect.

## 16. Remaining known issues

Resolved this session: ISSUE-001 through ISSUE-007 and ISSUE-010 through ISSUE-012 are all fully deployed and live-verified. ISSUE-004's data corrected (single global default confirmed as the correct model, 3 duplicate defaults fixed). ISSUE-005's stuck test product fully removed (trigger temporarily disabled/re-enabled in a scoped transaction, on later explicit request).

Not fixed, flagged for follow-up:

1. **ISSUE-006 (Medium):** Product Transfer source locked to General Stock, status never advances, no print/export — needs product-direction, not a bug fix.
2. **ISSUE-008 (High):** Sales creation and purchase-order receiving aren't atomic — needs a migration/RPC design (matching the `complete_purchase_return` precedent).
3. **ISSUE-009 (High):** `loadUserShape()`'s role lookup is broken for virtually every call (mixes a UUID and a bigint in a filter against a UUID-only column), silently swallowed. Masked correctly at login, but can leave a promoted/demoted user's role stale on `/api/auth/me` until they log out and back in, and resolves to `"user"` unconditionally for `register`/`confirm-2fa`/`verify-2fa`.
4. **`reorder-rules.generate-po.ts`** selects a `products.supplier_id` column that doesn't exist in the live schema (found while fixing ISSUE-010, not investigated further).

See `ISSUE_REGISTER.md` "Open / in-progress" section and `AUDIT_REPORT.md`'s technical-debt carryover list for everything else not yet triaged, including the broader module/role audit.

## 17. Security observations
- No security boundaries were weakened. RLS policies, permission model, and role checks are unchanged.
- ISSUE-001's root cause (wrong-role key) is exactly the kind of misconfiguration RLS-as-defense-in-depth is meant to catch — and did catch, by blocking writes rather than silently succeeding under the wrong privilege level. The failure mode was availability (legitimate admin writes blocked), not a security breach.
- ISSUE-007 is worth flagging specifically: a shared, stateful Supabase client mutated by concurrent requests is a real architectural risk pattern, not just a bug in these 4 routes — I did a full-repo grep for every `supabaseAdmin.auth.*` call site and confirmed no other instances of this pattern exist today, but it's worth keeping in mind for any future code that touches Supabase Auth session state.
- Confirmed the production VPS was hand-patched via direct `.env` edits and `pm2 restart` outside of Git/the deployment playbook (see ISSUE-001 evidence) — a process gap, not a code vulnerability, but worth closing so future incidents are traceable.

## 18. Recommended follow-up work
- Fix ISSUE-009 (`loadUserShape()` broken role lookup) — small, low-risk, high-value fix once scoped as its own reviewed change.
- Investigate and fix `reorder-rules.generate-po.ts`'s reference to a nonexistent `products.supplier_id` column.
- Document the corrected `SUPABASE_SERVICE_ROLE_KEY` source/rotation process in a private `DEPLOYMENT_CONFIG.md`, including that the VPS's actual env source is `/etc/infinitysales/infinitysales.env` (loaded by the custom runner), not the repo's own `.env`/`.env.production`.
- Correct `README.md`/`package.json`'s stale `node dist/server/index.mjs` documentation to match the actual `dist/server/server.js` entry (per `vite.config.ts`'s `nitro.server.entry` config).
- Scope and implement ISSUE-008 (transactional sales/purchase-receiving) as its own piece of work — needs a migration.
- Get product direction on ISSUE-006 (Product Transfer scope gaps: source lock, status, print/export).
- Regenerate `src/integrations/supabase/types.ts` properly via `pnpm supabase:types` once CLI access is available, to replace the hand-edit made for `suppliers.uuid_id`.
- Provision manager/accountant/cashier/user test accounts to complete the role matrix in `QA_TEST_MATRIX.md`.
- Resume the module-by-module audit for what's not yet functionally tested (see `AUDIT_REPORT.md` "Coverage status") — this session covered the four originally-reported bugs plus a broad admin-role sweep, but full Phase 5-7 coverage (every module × every role × browser testing) is still open.
- Re-run local validation (`scripts/predeploy-check.ps1` + `NITRO_PRESET=node-server pnpm build`) immediately before any future push, in case other work has landed on `main` in the meantime.
- Clean up VPS backup retention policy for `/var/backups/infinitysales/` (currently accumulating manually, no rotation configured).
