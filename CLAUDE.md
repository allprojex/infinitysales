# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Infinity Sales Pro — a POS, inventory, HR, accounting, and analytics platform. Built on TanStack Start, React 19, Tailwind v4, and Lovable Cloud (Supabase). This is a Lovable-managed project (`.lovable/`); it may also be edited via the Lovable web editor, so keep changes compatible with that workflow.

## Related documentation

Three companion documents at the project root cover ground this file doesn't:

- `DEVELOPMENT_GUIDE.md` — the authoritative deep-dive reference: full application architecture, database schema and relationships, RLS, authentication/authorization flow, every business workflow (sales, purchasing, inventory, warehouse, customers, suppliers, reports, etc.), and a verified list of known technical debt and security considerations. Consult it before making non-trivial changes, and update it when architecture or workflows change (see Documentation Workflow below).
- `AI_RULES.md` — universal engineering rules that apply to every AI coding assistant working on this repo (not just Claude Code), in addition to the rules in this file.
- `README.md` — setup, environment variables, and build/test/deploy commands.

## Package manager

**pnpm only** — do not use npm, yarn, or bun (even though some older docs/comments mention bun). Mixing managers breaks the lockfile and build.

```bash
corepack enable
pnpm install --frozen-lockfile
```

## Common commands

```bash
pnpm dev                    # vite dev server, http://localhost:8080
pnpm build                  # production build (Vite + Nitro) -> dist/
pnpm start                  # run the built server (node dist/server/index.mjs)
pnpm lint                   # eslint .
pnpm format                 # prettier --write .

pnpm test:unit              # vitest run (jsdom)
pnpm test:unit:watch        # vitest watch mode
pnpm test:e2e               # playwright, against a deployed/preview URL (not local dev)
pnpm test:e2e:ui            # playwright interactive UI

pnpm supabase:types         # regenerate src/integrations/supabase/types.ts from the live schema
pnpm supabase:types:check   # CI check: fail if committed types are stale
```

Run a single unit test file: `pnpm vitest run src/routes/api/-sales-helpers.test.ts`
Run a single e2e spec: `pnpm playwright test e2e/pos-cash-total.spec.ts`

Playwright tests need `E2E_BASE_URL` + `E2E_ADMIN_EMAIL`/`PASSWORD`, `E2E_MANAGER_EMAIL`/`PASSWORD`, `E2E_USER_EMAIL`/`PASSWORD` (see `e2e/README.md`). Specs skip cleanly if these are unset. They default to `https://infinitysales-pro.lovable.app` and run with `workers: 1` (sequential) because suites create/mutate real accounting records and would otherwise race each other.

The default Nitro preset targets Cloudflare Workers. For a plain Node host, build with `NITRO_PRESET=node-server pnpm build`.

## Architecture

### Two separate routing systems — don't confuse them

1. **TanStack Start file-based routes** (`src/routes/`) are used for exactly three things: the root shell (`__root.tsx`), the `/api/*` server endpoints, and a single catch-all page route (`src/routes/$.tsx`) that lazy-loads and mounts `src/DashboardApp.tsx`.
2. **The actual app UI** (dashboard, POS, sales, HRM, etc.) is a client-side SPA living inside `DashboardApp.tsx`, routed with **wouter** (not TanStack Router), rendering lazy-loaded page components from `src/pages/*.tsx`.

So: to add an application page, create `src/pages/foo.tsx` and register it as a lazy import + `<Route>` in `DashboardApp.tsx` — do **not** add it under `src/routes/`. `src/routes/README.md` reiterates: never create `src/pages/` under `src/routes/` or Next.js/Remix-style `app/` directories there — that directory is exclusively TanStack's file router.

### `/api/*` server routes (`src/routes/api/`)

- Each real endpoint file exports `Route = createFileRoute("/api/...")({ server: { handlers: { GET, POST, ... } } })`.
- Files/dirs prefixed with `-` or `_` (e.g. `-sales-helpers.ts`, `_resource-helpers.ts`, `_auth-helpers.ts`) are **not routes** — TanStack Router's generator ignores them. They hold shared server-only logic imported by the real route files. Co-located `*.test.ts` files (e.g. `-sales-helpers.test.ts`) are Vitest unit tests for that helper.
- `src/routes/api/$.ts` is a catch-all that returns `501 { migrationStatus: "pending" }` for any `/api/*` path not yet migrated to a real handler — this is intentional (Lovable Cloud migration in progress), not a bug.
- `_resource-helpers.ts` is the core toolkit: `requireUser`/`requireAdmin`/`requireHrmAccess` (auth guards), `listCreateHandlers`/`itemHandlers` (generic CRUD factories keyed by `user_id`), `rowToApi`/`apiToRow` (snake_case ↔ camelCase row conversion), `notify()` integration, `parseQuery`. Prefer these factories for simple CRUD resources rather than hand-rolling handlers.
- `-permission-helpers.ts` implements the app's custom permission model: permissions are stored as `perm_*` keys inside the **admin's** `user_settings.data` JSON (not per-user), and `requirePermission(request, key, defaultAllow)` checks role=admin first, then falls back to that shared permission map.
- Auth is bearer-token based: `getBearerUser(request)` reads `Authorization: Bearer <token>` and validates via `supabaseAdmin.auth.getUser`. Roles come from `public.user_roles` (`admin > manager > accountant > cashier > user`, see `ROLE_PRIORITY` in `_auth-helpers.ts`), not solely from JWT claims.

### Server-only code

- Files suffixed `.server.ts` (e.g. `client.server.ts`, `config.server.ts`) are stripped from the client bundle by Vite — put secrets/service-role logic there, never in code reachable from the browser. Do not import the npm `server-only` package (banned by eslint `no-restricted-imports`); use the `.server.ts` suffix or `@tanstack/react-start/server-only` instead.
- On the Cloudflare Workers target, `process.env` binds **per-request**, not at module load. Never read `process.env.X` at module scope in server code — read it inside the handler/function body (see comment block in `src/lib/config.server.ts`).
- `import.meta.env.VITE_*` is for values safe to ship to the browser (public URLs, IDs). Never put secrets behind a `VITE_` prefix.
- `src/server.ts` wraps the TanStack server entry to catch h3's swallowed in-handler throws (which otherwise surface as an opaque 500 with `{"unhandled":true}`) and render a friendly error page instead.

### Supabase / Lovable Cloud

- `src/integrations/supabase/types.ts`, `auth-middleware.ts` are **generated** — don't hand-edit; regenerate with `pnpm supabase:types`. Requires `supabase login` or `SUPABASE_ACCESS_TOKEN`; the project is linked via `supabase/config.toml`.
- `supabase/migrations/` — raw SQL migrations (applied through Lovable Cloud / Supabase, not run automatically by this repo's scripts).
- `supabase/functions/ai-proxy` — the one Supabase Edge Function in this repo.
- No database dashboard is needed for normal admin tasks — the Lovable editor's "View Backend" panel covers DB/Users/Storage; Supabase CLI access is only needed for type generation.

### Frontend state/context

- `src/lib/auth-context.tsx` — auth session state (`AuthProvider`/`useAuth`), paired with `src/lib/auth-routing.ts` (`protectedRouteRedirect`) for guarding wouter routes.
- `src/lib/permissions-context.tsx` — client-side mirror of the `perm_*` permission model described above (`PermissionsProvider`/`usePermissions`), consumed by `PrivateRoute` in `DashboardApp.tsx` via `permKey`/`defaultAllow`/`adminOnly`/`adminOrManager` props.
- `src/workspace/api-client-react/` — generated typed API client (`generated/api.ts`, `api.schemas.ts`); `src/lib/api-bootstrap.ts` wires its base URL (`VITE_API_BASE_URL`, defaults to page origin) and bearer-token getter (reads `localStorage.accessToken`) once at app start.

### UI components

shadcn/ui ("new-york" style, slate base, no RSC) — see `components.json` for aliases (`@/components`, `@/components/ui`, `@/lib`, `@/hooks`). Icons via `lucide-react`.

## Linting/formatting notes

- ESLint has several rules deliberately relaxed for this codebase: `@typescript-eslint/no-explicit-any`, `no-unused-vars`, `no-unused-expressions`, `prefer-const`, `no-empty`, `no-useless-escape` are all off. Don't "fix" these unless asked.
- Prettier runs as an ESLint rule (`eslint-plugin-prettier/recommended`), so `pnpm lint` also enforces formatting.
- `src/routeTree.gen.ts` and `src/workspace/api-client-react/generated/**` are eslint-ignored generated files.

# Development Workflow

- Always inspect the existing implementation before making changes.
- Never guess business rules, database schema, authentication flow, permissions, or architecture.
- Explain the current implementation before proposing changes.
- Present a clear implementation plan before editing files.
- Identify the files, modules, APIs, database objects, and services that will be affected.
- Follow the existing project structure, naming conventions, coding style, and architecture.
- Extend existing functionality instead of rewriting working modules unless explicitly requested.
- Preserve backward compatibility whenever possible.
- If multiple approaches are possible, recommend the safest and most maintainable option before implementation.

# Database & Backend Rules

- Inspect the current database schema before proposing database changes.
- Never modify a production database without my explicit approval.
- Create migration files instead of making direct schema changes whenever possible.
- Never drop tables, columns, functions, triggers, policies, or production data unless I explicitly approve it.
- Preserve existing data and relationships.
- Review and maintain Row Level Security (RLS) policies whenever database changes are made.
- Never expose service-role keys, API secrets, tokens, passwords, or environment variables.
- Compare migrations with the current schema before recommending changes.
- Clearly explain the impact of every migration before applying it.

# Package Management

- Detect the package manager used by the current project before running commands.
- Use the project's existing package manager only.
- If the project uses pnpm, use pnpm.
- If the project uses npm, use npm.
- If the project uses Yarn, use Yarn.
- Never switch package managers.
- Never regenerate or replace the existing lockfile.
- Confirm the package manager from package.json and the existing lockfile before installing dependencies.

# Code Quality

- Reuse existing components, utilities, services, and helper functions where appropriate.
- Avoid duplicate logic.
- Keep code modular, readable, and maintainable.
- Follow the project's existing folder structure.
- Do not edit generated files unless absolutely necessary.
- Add comments only when they improve clarity.
- Do not introduce unnecessary dependencies.

# Testing & Verification

After implementing any feature or bug fix:

- Run type checking.
- Run linting.
- Run all available tests.
- Run the production build.
- Fix any issue introduced by the implementation.
- Report every command executed.
- Summarize every file modified.
- Explain how I can manually test the feature.

If any command cannot run, explain why instead of skipping it silently.

# Git Workflow

- Never commit changes unless I explicitly ask.
- Never push changes unless I explicitly ask.
- Never merge branches unless I explicitly ask.
- Never rewrite Git history.
- Never create pull requests unless I explicitly request them.

# Communication

Before implementation:

1. Explain the current implementation.
2. Explain the proposed solution.
3. List the files that will be modified.
4. Identify database changes.
5. Mention risks and possible side effects.

After implementation:

1. Summarize all changes made.
2. Explain how to test the feature.
3. Mention any remaining limitations or recommended improvements.

# Security

- Never disable authentication or authorization to make a feature work.
- Never weaken security for convenience.
- Protect existing permissions and role-based access.
- Never expose secrets, tokens, passwords, API keys, or private credentials.
- Clearly identify any security implications of the proposed solution.

# Deployment

- Never deploy automatically.
- Never modify production infrastructure without my approval.
- Explain deployment steps before making deployment-related changes.
- Clearly distinguish between development, staging, and production environments.

# General Principle

Treat this project as a production application. Prioritize correctness, maintainability, security, and compatibility over speed. When requirements are ambiguous, ask for clarification instead of making assumptions.
