# Production Audit Report — Infinity Sales Pro

Live document, updated as the module-by-module / role-by-role audit proceeds. See `ISSUE_REGISTER.md` for per-defect detail, `QA_TEST_MATRIX.md` for the role×module results grid, `PRODUCTION_FIX_REPORT.md` for the deployment-focused rollup.

- **Audit start:** 2026-07-19
- **Production app:** https://infinitytechapp.com
- **Repository:** https://github.com/allprojex/infinitysales (branch `main`, base commit `b3de7dc`)
- **Roles tested:** admin (`infinitytechub@outlook.com`, confirmed working credentials this session). Manager/accountant/cashier/user role testing is pending dedicated test accounts (none currently available — see Phase 6 note below).

## Module inventory

Built from `src/pages/*.tsx` + `DashboardApp.tsx` route table + `DEVELOPMENT_GUIDE.md` §6 permission-key reference.

| Module | permKey | defaultAllow | Status |
| --- | --- | --- | --- |
| Dashboard | perm_user_pos / n/a | true | Not yet audited this session |
| POS / Sales / Quotations / Sales Returns / Price Lists / Promotions | perm_user_sales, perm_user_pos | true | Not yet audited this session |
| Customers, People | perm_user_customers | true | Partially audited (see ISSUE-001 evidence: creation works) |
| Products, Adjustments, Warehouses, Serial Numbers, Branches, Stock Take | perm_user_inventory | true | Warehouses: audited (ISSUE-001). Products: creation confirmed working. Others not yet audited. |
| Purchases, Purchase Returns, Suppliers, Supplier Invoices, Reorder Rules | perm_user_purchases | true | Not yet audited this session |
| Accounting, Expenses, Cash Mgmt, Customer Credits, Bank Reconciliation | perm_user_accounting | true | Not yet audited this session |
| Reports, Analytics, AI Insights, VAT Report | perm_user_reports | true | Not yet audited this session |
| Settings (all subsections) | perm_user_settings | true | System Settings + Company Profile: audited (ISSUE-001). Other subsections not yet audited. |
| HRM, Duty Roster, Payroll, Leave, Attendance, Departments | perm_user_hrm | false (opt-in) | Not yet audited this session |
| Product Transfer | perm_user_product_transfers | false (opt-in) | Audited (ISSUE-006) — core flow verified working live, 3 scope gaps flagged for direction |
| Generated Reports, Security Centre, Category admin, Admin Settings, Audit Logs, Backup, Recycle Bin | — (adminOnly) | — | Not yet audited this session |
| Import Portal | — (adminOrManager) | — | Not yet audited this session |
| Smoke-test panel | — (adminOnly) | — | Audited (ISSUE-001, ISSUE-002) |
| Projects, Tasks | module_projects/module_tasks | true | Not yet audited this session |

## Findings so far

See `ISSUE_REGISTER.md` for full detail. Summary:

- **ISSUE-001 (Critical, remediated on prod by manual action before this audit, hardening pending deploy):** service-role key misconfiguration caused RLS failures across user_settings/warehouses/customers/products.
- **ISSUE-002 (Medium, fixed locally, pending deploy):** smoke-test cleanup not run-scoped, could delete unrelated runs' data.
- **ISSUE-003 (High, fixed locally + root-cause confirmed live, pending deploy):** Stock Take creation scoped to any specific warehouse fails outright (`invalid input syntax for type uuid`) — the actual, currently-active source of the recurring uuid-cast errors seen in logs.
- **ISSUE-004 (Medium, fixed locally, pending deploy + data-fix approval):** two warehouses simultaneously marked default in production; code fix prevents recurrence, existing bad data needs your approval to correct.
- **ISSUE-005 (Medium, fixed locally, pending deploy + cleanup approval):** deleting a product with stock-movement history threw a raw leaked SQL error instead of a clean 409; also left my own test product stuck in production, awaiting your approval to fully remove it.
- **ISSUE-006 (Medium, confirmed, not fixed — needs product-direction, not a bug fix):** Product Transfer source is UI-locked to General Stock (real warehouse-to-warehouse transfer is impossible today), status never advances past "pending", no print/export. Core create/validate/deduct/increment flow verified correct via live testing.
- **ISSUE-007 (Critical, fixed locally + root-cause confirmed live, pending deploy):** the shared, process-wide `supabaseAdmin` client had its auth session mutated by `signInWithPassword`/`refreshSession`/`verifyOtp` calls in 4 auth routes, causing intermittent cross-request RLS failures on whatever table any *other* concurrent request happened to write to. This is a deeper, ongoing root cause independent of ISSUE-001's bad-key incident — confirmed by directly reproducing it (concurrent heartbeat calls failing during a registration call) against the still-unfixed production code.

## Known technical debt carried into this audit (from DEVELOPMENT_GUIDE.md §32)

To be individually re-verified against live production and triaged into the issue register:

1. Serial number registration broken (`serialNumber` vs `serial` field mismatch)
2. Stock-take "commit adjustments" does nothing
3. Reorder-rules "Auto-generate PO" toggle cosmetic; response shape mismatch breaks success toast
4. Adjustments' real stock-mutation logic not in this repo (relies on undocumented DB trigger/function)
5. Sales returns UI is a stub despite a working, unused `create_completed_sales_return` function
6. Quotations can't convert to a sale
7. Price lists not applied at checkout
8. Promotions have no code-redemption step
9. Cash sessions not reconciled against actual sales
10. POS hardware integrations are stubs
11. Loyalty points on POS receipts are cosmetic; `/api/loyalty/customers` shape mismatch
12. Product transfers locked to "General Warehouse" source; status never advances past "pending"; delete doesn't revert stock
13. Warehouse deletion orphans `stock_movements` rows
14. Customers/suppliers list-vs-item scoping inconsistent
15. `cashier-performance` report is a non-functional stub
16. `pending_logins` dead/undocumented schema drift
17. Several DB functions/columns exist live with no corresponding migration
18. 2FA not enforced at login
19. Hardcoded default-admin credentials in source
20. No CI/CD pipeline

- **ISSUE-008 (High, root-caused via code review, not fixed — needs migration/design approval):** `POST /api/sales` isn't atomic; a failure partway through (stock decrement, customer spend update, or credit charge) leaves the sale row committed anyway, with no rollback. Proper fix likely needs a Postgres RPC function (matching the existing `complete_purchase_return` pattern) and a migration — flagged rather than implemented unilaterally.
- **ISSUE-009 (High, root-caused via post-deploy log correlation, not fixed — out of deployment scope):** `loadUserShape()`'s role lookup mixes a UUID and a bigint in a filter against a UUID-only column, 400s on virtually every call, silently swallowed. Masked at login by a correct fallback; not masked on `/api/auth/me` (stale role after refresh for anyone whose role changed since account creation) or `register`/`confirm-2fa`/`verify-2fa` (always resolve to `"user"`).

## Deployment

Commits `d221551` + `33e2e86` were pushed to `origin/main` and deployed to production (VPS) on 2026-07-19, with explicit separate approvals for push and deploy, full backups taken first, and all 8 required live verification checks passing (see `PRODUCTION_FIX_REPORT.md` §12-13 for full detail). ISSUE-009 was discovered incidentally during the mandatory post-deploy log review — not caused by this deployment.

## Coverage status at this checkpoint

**Thoroughly audited (code review + live API testing against production):** Admin Settings (System Settings, Company Profile), Warehouses (create/default), Products (create/delete), Customers/Suppliers (create), Smoke-test panel, Product Transfer (full flow), Stock Take (create).

**Root-caused via live reproduction, not yet fully role-tested:** the two critical concurrency/environment bugs (ISSUE-001, ISSUE-007) and the Stock Take uuid crash (ISSUE-003).

**Reviewed via code only, surfaced non-atomicity findings (ISSUE-008), not live-write-tested (deliberately, to avoid polluting real revenue/inventory data without an approved test plan):** Sales/POS create path, Purchase Order receiving.

**Broad liveness sweep (admin role, GET endpoints) — all responded correctly (200, or a correct 403 for the opt-in-gated HRM endpoints):** Reports (summary, revenue, top-products, dead-stock, expired-inventory, inventory-valuation, profit-loss, cashier-performance, warehouse-report), VAT report, Purchase Orders, Suppliers, Supplier Invoices, Expenses, Bank Accounts, Promotions, Reorder Rules, Notifications, Audit Logs, Recycle Bin, Generated Reports, Cash Sessions, Security Centre (stats, locked-users, blocked-ips, events, mfa-settings, compliance, api-abuse — all confirmed working after correcting an initial URL mistake on my part, dot- vs slash-separated paths). This is a shallow "does the endpoint respond correctly" pass, not full functional/mutation testing of each module.

**Not yet functionally tested (create/update/delete flows, not just GET):** Purchases, Purchase Returns, Supplier Invoices, Reorder Rules, Accounting/Expenses/Cash Management/Bank Reconciliation, Customer Credits, Promotions, HRM (all subsections — blocked by the opt-in permission not being enabled for this admin, by design), Settings subsections beyond System Settings/Company Profile, Security Centre actions (unlock user, block IP, etc.), Backup, Import Portal, Projects/Tasks.

**Not yet possible:** any role other than admin (manager/accountant/cashier/user) — no test credentials available for those roles this session. Full browser/console/network testing (Phase 7) not yet run.

## Next steps

The remaining scope (every module listed above, times 5 roles, plus full browser/console/network testing per Phase 7) is substantial — realistically multiple further sessions of work, not a continuation of this single turn. See the conversation for the checkpoint discussion on how to prioritize it.
