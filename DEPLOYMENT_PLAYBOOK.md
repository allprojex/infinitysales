# Deployment Playbook

A reusable, safety-first deployment procedure for shipping a Node/TypeScript application from a local machine to a production VPS, with GitHub as the sole source of truth.

This document was written for **Infinity Sales Pro** (TanStack Start / React 19 / pnpm, deployed to a Hostinger VPS) but is deliberately split into **universal** sections (process, checklists, safety rules — copy as-is to any project) and **project-specific** sections (exact commands and server details — fill in per project via `DEPLOYMENT_CONFIG.example.md`).

Every command below is written as `<PLACEHOLDER>` where it varies by project. Concrete values for *this* project are noted inline as examples.

---

## 1. Purpose

Give every deployment — for a human or an AI assistant — one predictable, auditable path from a code change to a verified production release, with:

- No local, uncommitted, or unpushed code ever reaching production.
- A mandatory human review/approval gate before each irreversible step (commit, push, deploy, migrate, rollback).
- A repeatable verification pass after every deploy, and a known-good rollback point at all times.

This is a **process document**, not a script you blindly run. Every step that touches Git, GitHub, the VPS, or the database requires explicit human approval before it executes — see [§15 Security Rules](#15-security-rules).

---

## 2. Required Deployment Order (Universal)

```
1. Develop locally
2. Validate locally        (lint, typecheck, tests, build)
3. Review changes          (human approval)
4. Commit to Git           (human approval)
5. Push to GitHub          (human approval)
6. Verify the GitHub push
7. Deploy to the VPS by pulling from GitHub   (human approval)
8. Verify the production application
9. Produce a deployment report
```

Never skip a step. Never reorder steps 4–7. Never deploy from anything other than a commit that is confirmed present on GitHub.

**GitHub is always the source of truth.** The VPS deployment step is always a `git fetch` + `git pull` against the approved remote branch/commit — never a copy, `rsync`, `scp`, or manual file edit of local work onto the server.

---

## 3. Local Validation Checklist (Universal process / project-specific commands)

Run before requesting review, ideally via the project's predeploy script (`scripts/predeploy-check.ps1` for this project).

- [ ] Confirm you are in the correct project directory and on the correct branch.
- [ ] `git status` — review every modified and untracked file.
- [ ] Run the lint command: `<LINT_COMMAND>` — this project: `pnpm lint`
- [ ] Run type checking: `<TYPECHECK_COMMAND>` — this project: `pnpm exec tsc --noEmit -p tsconfig.json` (no dedicated `typecheck` script exists; `tsconfig.json` sets `noEmit: true`)
- [ ] Run automated tests: `<TEST_COMMAND>` — this project: `pnpm test:unit` (Vitest, jsdom). Playwright E2E (`pnpm test:e2e`) targets a **deployed** URL and needs live credentials — treat it as a post-deploy smoke check (§10), not a pre-deploy gate.
- [ ] Run the production build: `<BUILD_COMMAND>` — this project: `pnpm build` (Cloudflare Workers preset) or `NITRO_PRESET=node-server pnpm build` (Node/Hostinger target — used for VPS deploys)
- [ ] Stop immediately if any check fails. Fix the root cause; do not bypass or suppress a failing check to "get through" validation.

---

## 4. Git and GitHub Workflow (Universal)

1. **Review** — summarize files changed, features/fixes, database changes, migrations, env-var changes, new dependencies, breaking changes, security implications, deployment risk, and rollback requirements. Wait for explicit approval.
2. **Commit** — only after approval. Use a clear, descriptive message. Never amend or rewrite history on a shared branch.
3. **Push** — push the approved commit to `<REPO_REMOTE>` (this project: `origin` → `<GITHUB_REPO_URL>`), on `<PRODUCTION_BRANCH>` (this project: `main`).
4. **Verify the push** — confirm the remote branch's HEAD commit hash matches what you just pushed (`git ls-remote <REPO_REMOTE> <PRODUCTION_BRANCH>`, or check the GitHub UI/`gh api`). Record this commit hash — it is the *only* commit approved for deployment.
5. Stop if the push fails or the remote hash doesn't match. Do not proceed to deployment on a mismatch.

---

## 5. VPS Deployment Workflow (Universal process / project-specific values)

Only after the GitHub push is verified, and only with explicit approval to deploy:

1. Connect to `<VPS_HOST>` as `<VPS_SSH_USER>`.
2. `cd <APP_DIRECTORY>` — confirm this is the correct application directory (check for the project's `package.json` name field or an equivalent marker) before changing anything.
3. Record the currently deployed commit: `git rev-parse HEAD` in `<APP_DIRECTORY>`. This is the rollback target if the new deploy fails.
4. `git fetch origin`
5. Confirm `<PRODUCTION_BRANCH>` on the remote matches the approved commit hash from §4.
6. `git pull origin <PRODUCTION_BRANCH>` — a plain fast-forward pull. Never `git reset --hard`, `git clean -fd`, or force-pull without explicit separate approval, and only as a deliberate, reviewed recovery action.
7. Install dependencies with `<INSTALL_COMMAND>` (this project: `pnpm install --frozen-lockfile`) — only when the lockfile changed.
8. Apply only approved database migrations via `<MIGRATION_COMMAND>` (see [§6](#6-database-migration-workflow)) — never run migrations that weren't part of the reviewed change set.
9. Run the production build with `<BUILD_COMMAND>` (this project: `NITRO_PRESET=node-server pnpm build`).
10. Reload the correct PM2 process only: `pm2 reload <PM2_PROCESS_NAME>` (prefer `reload` over `restart` for zero-downtime where the app supports it).
11. Verify PM2, Nginx, and the health endpoint (§7–§9).
12. Confirm the deployed commit (`git rev-parse HEAD` on the VPS) matches the approved GitHub commit.

`scripts/deploy-from-github.sh.example` demonstrates this sequence as a template — copy it, fill in the placeholders, and review it before ever running it on a real server. It is intentionally not committed as an executable script.

---

## 6. Database Migration Workflow

- Migrations live in `<MIGRATIONS_DIR>` (this project: `supabase/migrations/`, applied through Lovable Cloud / Supabase — not run automatically by any script in this repo).
- Migrations are part of the reviewed change set in §4 — never introduce a migration at deploy time that wasn't already reviewed and approved.
- Apply migrations with `<MIGRATION_COMMAND>` — for a Supabase/Lovable Cloud project this is typically done through the Supabase CLI or the Lovable "View Backend" panel, **not** by this repo's build/deploy scripts.
- Never run destructive SQL (`DROP`, `TRUNCATE`, unscoped `DELETE`/`UPDATE`) as part of a routine deploy.
- Record the pre-migration schema state (or a `pg_dump` if the change is non-trivial) before applying, per your organization's backup policy.
- Migrations frequently cannot be cleanly rolled back (dropped columns/data loss). Document the rollback limitation for each migration in the change review (§4) *before* it is approved, not after.

---

## 7. PM2 Verification

```
pm2 status <PM2_PROCESS_NAME>       # process is 'online', not 'errored' or 'stopped'
pm2 logs <PM2_PROCESS_NAME> --lines 100 --nostream
pm2 describe <PM2_PROCESS_NAME>     # check restart count, uptime, memory
```

- Confirm the process uptime resets to just after the deploy (i.e., it actually reloaded).
- Confirm the restart count did not spike (a crash loop shows as repeated near-zero uptime).
- Only touch `<PM2_PROCESS_NAME>` — never `pm2 restart all` or any other app's process on a shared VPS.

---

## 8. Nginx Verification

```
sudo nginx -t                       # config syntax check
sudo systemctl status nginx         # service is active
curl -I https://<DOMAIN>            # expect 200/301/302, not 5xx or connection refused
```

Only reload Nginx (`sudo systemctl reload nginx`) if this deploy actually changed Nginx configuration, and only with separate explicit approval (see [§15](#15-security-rules)).

---

## 9. HTTPS and Health-Check Verification

```
curl -I https://<DOMAIN>                         # valid TLS, 200/redirect
curl -sf https://<DOMAIN><HEALTH_ENDPOINT>        # this project: /api/healthz
```

The health endpoint should return a fast 2xx response reflecting basic app/DB reachability. A failure here is a deploy-blocking signal — proceed to [§11 Rollback](#11-rollback-procedure).

---

## 10. Application Smoke Tests

Minimum manual (or scripted) checks after every deploy:

- [ ] Main login page loads over HTTPS.
- [ ] Login succeeds for a known test account.
- [ ] At least one protected/authenticated route loads correctly.
- [ ] A representative API endpoint returns expected data (not a 5xx or the `{"unhandled":true}` swallowed-error shape).
- [ ] Database connectivity confirmed (a read that hits the DB succeeds).
- [ ] No unexpected redirect loops or full-page refresh failures.
- [ ] Application logs show no new errors in the minute following deploy.

For this project, `pnpm test:e2e` against `<E2E_BASE_URL>` (with `E2E_ADMIN_EMAIL`/`PASSWORD`, `E2E_MANAGER_EMAIL`/`PASSWORD`, `E2E_USER_EMAIL`/`PASSWORD` set) can run this checklist as an automated pass once the new deployment is live.

---

## 11. Rollback Procedure

**Before deploying**, always have on hand:

- The previous production commit hash (recorded in §5 step 3).
- The exact rollback command: `git checkout <PREVIOUS_COMMIT_HASH>` (or `git reset --hard <PREVIOUS_COMMIT_HASH>` — destructive, requires explicit approval) followed by rebuild + PM2 reload.
- Known database-rollback limitations for any migration included in this deploy (§6) — some changes are one-way.
- Any files or environment-variable settings that were changed for this deploy and may need restoring.

**If production verification fails:**

1. Stop making further changes.
2. Preserve logs (`pm2 logs`, Nginx error log, application logs) before they rotate.
3. Explain the failure clearly — what check failed and the observed symptom.
4. Ask for explicit approval before rolling back.
5. On approval, check out the previous known-good commit, rebuild, and reload PM2.
6. Re-run [§7](#7-pm2-verification)–[§10](#10-application-smoke-tests) against the rolled-back version.
7. Only after rollback is verified is the incident considered closed.

---

## 12. Deployment Report Template

Produce this after every deployment, success or failure:

```markdown
## Deployment Report — <PROJECT_NAME>

- Date/time:
- Deployed by:
- Branch / commit:            <PRODUCTION_BRANCH> @ <COMMIT_HASH>
- Previous production commit: <PREVIOUS_COMMIT_HASH>

### Validation (local)
- Lint:        PASS/FAIL
- Type check:  PASS/FAIL
- Unit tests:  PASS/FAIL
- Build:       PASS/FAIL

### Change summary
- Files changed:
- Features/fixes:
- Database changes / migrations applied:
- Environment-variable changes:
- New dependencies:
- Breaking changes:

### Deployment
- GitHub push verified: YES/NO (commit hash)
- VPS pull verified:    YES/NO (commit hash on server)
- Dependencies installed: YES/NO
- Migrations applied:     YES/NO/N-A
- Build run on VPS:       YES/NO
- PM2 reloaded:           YES/NO (process name, new uptime)

### Verification
- PM2 status:
- Nginx status:
- HTTPS check:
- Health endpoint:
- Smoke tests:
- Log review (5xx / errors):

### Outcome
- Result: SUCCESS / ROLLED BACK / FAILED
- Rollback performed: YES/NO
- Follow-up actions:
```

---

## 13. Emergency Troubleshooting Checklist

- **App won't start / PM2 shows `errored`** — `pm2 logs <PM2_PROCESS_NAME> --lines 200`; check for missing env vars, port conflicts, or a failed build artifact.
- **502/504 from Nginx** — confirm the app process is actually listening on `<APP_PORT>` (`pm2 describe <PM2_PROCESS_NAME>`, `ss -ltnp | grep <APP_PORT>`); check the Nginx `proxy_pass` target matches.
- **Health endpoint failing but process is "online"** — likely a DB connectivity or env-var issue introduced by this deploy; check `<HEALTH_ENDPOINT>` response body and recent logs.
- **Deploy pulled the wrong commit** — re-run `git fetch origin && git log origin/<PRODUCTION_BRANCH> -1` on the VPS and compare against the approved hash; re-pull if it drifted.
- **Migration partially applied** — stop; do not attempt an automatic fix. Assess actual schema state before deciding on forward-fix vs. rollback, with approval.
- **Unsure what's currently deployed** — `git rev-parse HEAD` in `<APP_DIRECTORY>` on the VPS is always the source of truth for "what's live right now."

---

## 14. Security Rules

- GitHub is the only path code takes to production — no direct local→VPS file copies, ever.
- Never commit or paste real secrets, tokens, service-role keys, database passwords, or private keys into any file, script, commit message, or chat log — including this playbook, its config file, and deploy scripts. Use placeholders and reference a secrets manager or the host's environment-variable configuration instead.
- Never disable authentication/authorization or weaken RLS/permission checks to "make a deploy work."
- Never use destructive Git commands (`push --force`, `reset --hard`, `clean -fd`) on the VPS without explicit, separate approval for that specific action.
- Restart/reload only the target application's PM2 process — never `pm2 restart all` or another app's process on a shared host.
- Treat every approval in [§15 below / Required Approvals] as independent — a "yes, deploy" does not imply "yes, also change env vars" or "yes, also roll back."

## 15. Project-Specific Configuration Checklist

Fill these in via `DEPLOYMENT_CONFIG.example.md` (copy it to a private, untracked config for the real values) before this playbook can be used for VPS deployment:

| Placeholder | Meaning | This project's value |
| --- | --- | --- |
| `<REPO_REMOTE>` / `<GITHUB_REPO_URL>` | Git remote name / GitHub URL | `origin` / `https://github.com/allprojex/infinitysales.git` |
| `<PRODUCTION_BRANCH>` | Branch deployed to production | `main` |
| `<VPS_HOST>` | Hostinger VPS hostname/IP | *(not committed — fill in privately)* |
| `<VPS_SSH_USER>` | SSH user for deploys | *(not committed — fill in privately)* |
| `<APP_DIRECTORY>` | Absolute path to the app on the VPS | *(not committed — fill in privately)* |
| `<PM2_PROCESS_NAME>` | PM2 process name | *(not committed — fill in privately)* |
| `<APP_PORT>` | Internal port the Node server listens on | *(not committed — fill in privately)* |
| `<DOMAIN>` | Production domain | *(not committed — fill in privately)* |
| `<HEALTH_ENDPOINT>` | Health-check path | `/api/healthz` |
| `<PACKAGE_MANAGER>` | Package manager | `pnpm` (pinned `9.15.0`) |
| `<INSTALL_COMMAND>` | Dependency install | `pnpm install --frozen-lockfile` |
| `<LINT_COMMAND>` | Lint | `pnpm lint` |
| `<TYPECHECK_COMMAND>` | Type check | `pnpm exec tsc --noEmit -p tsconfig.json` (no `typecheck` script defined) |
| `<TEST_COMMAND>` | Automated tests | `pnpm test:unit` |
| `<BUILD_COMMAND>` | Production build | `NITRO_PRESET=node-server pnpm build` (VPS/Node target) |
| `<MIGRATIONS_DIR>` | Migration files location | `supabase/migrations/` |
| `<MIGRATION_COMMAND>` | How migrations are applied | Manual, via Supabase CLI or Lovable "View Backend" panel — not scripted in this repo |

This project's real VPS host, SSH user, application directory, PM2 process name, and domain are intentionally **not** recorded in this repo — see `DEPLOYMENT_CONFIG.example.md` for the template and where to keep the filled-in, private version.
