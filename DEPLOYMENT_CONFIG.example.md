# Deployment Configuration (Example)

Per-project values for `DEPLOYMENT_PLAYBOOK.md` and `scripts/deploy-from-github.sh.example`.

**How to use this file:** copy it to a location that is *not* committed to Git (e.g. `DEPLOYMENT_CONFIG.md` added to `.gitignore`, a password manager note, or your infra documentation system) and fill in the real values there. Keep this `.example.md` file in the repo as the template only.

**Do not put secrets, passwords, tokens, private keys, or database credentials in this file** — not even in the private copy. This file is for *locations and command names*, not credentials. Actual secrets belong in the VPS's environment configuration / a secrets manager, never in a Markdown file.

---

## Project

| Key | Value |
| --- | --- |
| Project name | `<PROJECT_NAME>` |
| GitHub repository | `<GITHUB_REPO_URL>` |
| Git remote name | `<REPO_REMOTE>` (usually `origin`) |
| Production branch | `<PRODUCTION_BRANCH>` |

## VPS

| Key | Value |
| --- | --- |
| VPS host | `<VPS_HOST>` |
| VPS SSH user | `<VPS_SSH_USER>` |
| VPS application path | `<APP_DIRECTORY>` |
| PM2 process name | `<PM2_PROCESS_NAME>` |
| Internal application port | `<APP_PORT>` |
| Domain | `<DOMAIN>` |
| Health endpoint | `<HEALTH_ENDPOINT>` |

## Toolchain

| Key | Value |
| --- | --- |
| Package manager | `<PACKAGE_MANAGER>` |
| Install command | `<INSTALL_COMMAND>` |
| Lint command | `<LINT_COMMAND>` |
| Type-check command | `<TYPECHECK_COMMAND>` |
| Test command | `<TEST_COMMAND>` |
| Build command | `<BUILD_COMMAND>` |
| Start command | `<START_COMMAND>` |

## Database

| Key | Value |
| --- | --- |
| Database platform | `<DATABASE_PLATFORM>` |
| Migration command | `<MIGRATION_COMMAND>` |
| Rollback instructions | `<ROLLBACK_INSTRUCTIONS>` |

---

## Filled-in example — Infinity Sales Pro

Values already known from the repository (safe to record — no secrets). Server-specific values (VPS host/user/path/process name/port/domain) are intentionally left as placeholders here; keep the real values only in your private, untracked copy of this file.

| Key | Value |
| --- | --- |
| Project name | Infinity Sales Pro |
| GitHub repository | `https://github.com/allprojex/infinitysales.git` |
| Git remote name | `origin` |
| Production branch | `main` |
| VPS host | `<VPS_HOST>` |
| VPS SSH user | `<VPS_SSH_USER>` |
| VPS application path | `<APP_DIRECTORY>` |
| PM2 process name | `<PM2_PROCESS_NAME>` |
| Internal application port | `<APP_PORT>` |
| Domain | `<DOMAIN>` |
| Health endpoint | `/api/healthz` |
| Package manager | `pnpm` (pinned `9.15.0`, via Corepack) |
| Install command | `pnpm install --frozen-lockfile` |
| Lint command | `pnpm lint` |
| Type-check command | `pnpm exec tsc --noEmit -p tsconfig.json` (no dedicated `typecheck` script exists in `package.json`) |
| Test command | `pnpm test:unit` (E2E via `pnpm test:e2e` is a post-deploy smoke check, not a pre-deploy gate — it targets a deployed URL) |
| Build command | `NITRO_PRESET=node-server pnpm build` (Node/Hostinger target; plain `pnpm build` targets Cloudflare Workers instead) |
| Start command | `pnpm start` (runs `node dist/server/index.mjs`) |
| Database platform | Supabase / Lovable Cloud (Postgres) |
| Migration command | Not scripted in this repo — applied manually via Supabase CLI or the Lovable "View Backend" panel against `supabase/migrations/` |
| Rollback instructions | `git checkout <PREVIOUS_COMMIT_HASH>` on the VPS, rebuild (`NITRO_PRESET=node-server pnpm build`), `pm2 reload <PM2_PROCESS_NAME>`. Database migrations may not be reversible — check each migration individually before relying on this for schema changes. |
