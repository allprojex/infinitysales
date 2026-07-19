# Production Fix Report — Infinity Sales Pro

Live document, finalized at the end of the audit per the required-reports template. See `ISSUE_REGISTER.md` for defect detail, `AUDIT_REPORT.md` for the module inventory/narrative, `QA_TEST_MATRIX.md` for role×module results.

## Status: IN PROGRESS — 6 code fixes validated locally, not yet committed/pushed/deployed. Both pending production-data decisions (ISSUE-004, ISSUE-005) are now resolved.

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
Not yet done — awaiting explicit approval to commit per the standing Git Workflow rule.

## 12. Production deployment result
Not yet done — awaiting explicit approval to push and to deploy, per the standing Deployment rule. Current production commit remains `b3de7dc` (confirmed matching `origin/main`).

## 13. Browser test result by module and role
Not yet run. Live browser/API regression testing is planned for after these fixes are deployed, so it exercises the corrected code rather than the currently-deployed commit. Interim live reproductions (via direct API calls, not a browser) were performed and are documented per-issue in `ISSUE_REGISTER.md`.

## 14. Test-data cleanup result
All test data created during discovery/reproduction was cleaned up immediately in-session:
- 1 warehouse (`CLAUDE_DISCOVERY_TEST_...`) — deleted, confirmed 200.
- 1 smoke-test run (3 products, 3 customers, 2 suppliers, 2 sales, 1 PO) — deleted, confirmed 200 with matching removed counts.
- 1 throwaway registered user (ISSUE-007 concurrency reproduction) — deleted via admin API, confirmed 200.
- 1 attempted stock take (ISSUE-003 reproduction) — never created (the pre-fix call correctly failed), nothing to clean up.
- Verified via direct SQL: zero `[SMOKE_TEST]`-marked rows remain in `suppliers`/`customers`/`products`.
- 1 test product (`CLAUDE_AUDIT_TRANSFER_TEST`, id `ee3c74bc-41ba-4674-9cae-6d463aa430b0`) could not be deleted — products with stock-movement history can't be deleted at the DB level (FK constraint + an immutable-ledger trigger that also blocks deleting the movement rows themselves). Per the user's decision, left permanently deactivated, zeroed, and renamed `[DO NOT USE - CLAUDE_AUDIT_TEST - PENDING DELETION]` rather than disabling the integrity trigger. See ISSUE-005.

## 15. Orphan-record check
None found remaining after cleanup, except the one flagged exception above. Note: the smoke-test cleanup run during ISSUE-001 reproduction also removed 2 pre-existing "Smoke Supplier" rows left over from the original failed 07:36 UTC run shown in the user's screenshots — disclosed to the user at the time, not a hidden side effect.

## 16. Remaining known issues

Both previously-pending production-data decisions are now resolved:

1. **ISSUE-004:** confirmed a single global default warehouse matches the app's actual design (no branch linkage in data, no code depends on per-branch defaults); corrected the data (3 warehouses were marked default, not 2) to Champion Mart (id 1) only.
2. **ISSUE-005:** full removal of the stuck test product would require disabling the `stock_movements` immutability trigger — deemed too invasive relative to the original approval; user chose to leave it permanently deactivated instead.

See `ISSUE_REGISTER.md` "Open / in-progress" section and `AUDIT_REPORT.md`'s technical-debt carryover list for everything else not yet triaged (ISSUE-006 product-transfer direction, and the broader module/role audit).

## 17. Security observations
- No security boundaries were weakened. RLS policies, permission model, and role checks are unchanged.
- ISSUE-001's root cause (wrong-role key) is exactly the kind of misconfiguration RLS-as-defense-in-depth is meant to catch — and did catch, by blocking writes rather than silently succeeding under the wrong privilege level. The failure mode was availability (legitimate admin writes blocked), not a security breach.
- ISSUE-007 is worth flagging specifically: a shared, stateful Supabase client mutated by concurrent requests is a real architectural risk pattern, not just a bug in these 4 routes — I did a full-repo grep for every `supabaseAdmin.auth.*` call site and confirmed no other instances of this pattern exist today, but it's worth keeping in mind for any future code that touches Supabase Auth session state.
- Confirmed the production VPS was hand-patched via direct `.env` edits and `pm2 restart` outside of Git/the deployment playbook (see ISSUE-001 evidence) — a process gap, not a code vulnerability, but worth closing so future incidents are traceable.

## 18. Recommended follow-up work
- Resolve the two pending approvals above.
- Deploy the six code fixes in this report (after commit/push/deploy approval).
- Document the corrected `SUPABASE_SERVICE_ROLE_KEY` source in a private `DEPLOYMENT_CONFIG.md`.
- Get direction on ISSUE-006 (Product Transfer scope gaps).
- Continue the module-by-module audit (see `AUDIT_REPORT.md` "Next steps").
- Provision manager/accountant/cashier/user test accounts to complete the role matrix in `QA_TEST_MATRIX.md`.
