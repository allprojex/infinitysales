# E2E tests

Playwright specs that verify role-based scoping of cash totals on both the
Dashboard and the POS Terminal, across desktop and mobile viewports.

## Required env vars

```
E2E_BASE_URL=https://infinitysales-pro.lovable.app   # or your preview URL
E2E_ADMIN_EMAIL=admin@example.com
E2E_ADMIN_PASSWORD=...
E2E_MANAGER_EMAIL=manager@example.com
E2E_MANAGER_PASSWORD=...
E2E_USER_EMAIL=cashier@example.com
E2E_USER_PASSWORD=...
```

If any are missing, the specs skip with a clear message (CI-safe).

## Run

```
bunx playwright install chromium
bun run test:e2e            # all projects (desktop + mobile)
bun run test:e2e -- --project=chromium-mobile
bun run test:e2e:ui         # interactive
```

## What's covered

- `dashboard-scope.spec.ts` — Total Revenue + Purchase Orders KPI cards
  carry `data-scope="all"` + "All users" badge for admins/managers, and
  `data-scope="own"` (no badge) for standard users. Cross-account check
  asserts admin totals are >= standard user totals.
- `pos-cash-total.spec.ts` — Same role-scoping invariant on the POS Terminal
  "Today's cash" KPI.

Each spec runs in both the `chromium-desktop` (1440x900) and
`chromium-mobile` (Pixel 5) projects defined in `playwright.config.ts`.
