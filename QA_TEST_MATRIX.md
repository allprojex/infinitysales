# QA Role × Module Test Matrix — Infinity Sales Pro

Live document. ✅ = verified working (server-enforced, not just UI-hidden). ❌ = defect found (see `ISSUE_REGISTER.md` for the ID). ⬜ = not yet tested. 🔒 = correctly blocked/hidden for this role (expected).

**Role coverage note:** Only an `admin` test account (`infinitytechub@outlook.com`) was available at audit start. Manager/accountant/cashier/user role coverage requires dedicated test accounts, which have not yet been provisioned — see open question in `AUDIT_REPORT.md`. Matrix below will be filled in as each role is actually tested; do not read a blank cell as "assumed working."

| Module | Admin | Manager | Accountant | Cashier | User |
| --- | --- | --- | --- | --- | --- |
| Login / auth / portal separation | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| Dashboard | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| Settings — System Settings | ✅ (save works, ISSUE-001) | ⬜ | ⬜ | ⬜ | ⬜ |
| Settings — Company Profile | ✅ (save works, ISSUE-001) | ⬜ | ⬜ | ⬜ | ⬜ |
| Settings — other subsections | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| Warehouses — create | ✅ (ISSUE-001) | ⬜ | ⬜ | ⬜ | ⬜ |
| Warehouses — edit/default/activate/delete | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| Products — create | ✅ | ⬜ | ⬜ | ⬜ | ⬜ |
| Products — full CRUD/search/filter | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| Product Transfer | ✅ core flow (ISSUE-006 gaps flagged) | ⬜ | ⬜ | ⬜ | 🔒 (opt-in, off by default) |
| Customers | ✅ create (smoke-test) | ⬜ | ⬜ | ⬜ | ⬜ |
| Suppliers | ✅ create (smoke-test) | ⬜ | ⬜ | ⬜ | ⬜ |
| Sales / POS | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| Purchases | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| Purchase Returns | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| Expenses / Accounting | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| Reports | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| Promotions | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| HRM | ⬜ | ⬜ | ⬜ | ⬜ | 🔒 (opt-in, off by default) |
| Admin Settings / Security Centre / Audit Logs / Backup / Recycle Bin | ⬜ | 🔒 expected | 🔒 expected | 🔒 expected | 🔒 expected |
| Smoke-test panel | ✅ (ISSUE-001, ISSUE-002) | 🔒 expected | 🔒 expected | 🔒 expected | 🔒 expected |
| Notifications / audit log correctness | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |

## Browser/device coverage

Not yet run this session (Chromium desktop + mobile viewport, console error capture, network failure capture) — pending once the two approved code fixes are deployed, so live testing exercises the fixed code rather than the currently-deployed commit.
