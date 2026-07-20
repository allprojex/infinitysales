# AI Engineering Standards

This document defines the universal engineering rules for this project. It applies to every AI coding assistant that reads, writes, or modifies code in this repository — including but not limited to Claude Code, Codex, Cursor, GitHub Copilot, Windsurf, Cline, and Roo Code, as well as any future tool used on this codebase.

These rules exist independently of any single tool's configuration file. Where a tool has its own project instructions (for example, `CLAUDE.md`), those instructions apply in addition to this document, not instead of it. This file is the common baseline every assistant must follow regardless of which tool is in use.

## Understand Before Building

- Inspect the existing implementation before making changes.
- Never assume requirements. If the request is ambiguous, ask before proceeding.
- Never guess architecture or business logic. If it isn't visible in the code, find it — don't invent it.
- Read all relevant files before proposing changes, not just the file being edited.
- Understand the current data flow before editing it — trace where data comes from and where it goes.

## Architecture

- Preserve the existing architecture. Do not introduce a parallel pattern where an established one already exists.
- Extend working modules instead of rewriting them.
- Reuse existing utilities, hooks, services, and components rather than creating new ones that duplicate their behavior.
- Avoid duplicate logic. If similar logic already exists, adapt it instead of copying it.
- Follow the existing folder structure. New files belong where the existing convention places them.
- Respect naming conventions already in use in the surrounding code.

## Planning

Before implementation:

- Explain the current implementation as it exists today.
- Explain the proposed solution and why it's the right approach.
- List the files that will be affected.
- List any database objects that will be affected.
- Mention risks and possible side effects.
- Wait for approval before implementing major architectural or database changes. Small, obviously-scoped fixes do not require this ceremony, but anything that changes structure, schema, or shared behavior does.

## Database

- Inspect the current schema before proposing or making any database change.
- Preserve existing data. Changes must not silently drop or corrupt data.
- Never execute destructive SQL (`DROP`, `TRUNCATE`, unscoped `DELETE`/`UPDATE`, etc.) without explicit approval.
- Use migrations for schema changes rather than ad hoc modifications.
- Review Row Level Security (RLS) policies whenever tables are added, changed, or have their access patterns modified.
- Explain the impact of every migration before it is applied — what it changes, what it affects, and what the rollback looks like.
- Never expose secrets or service-role keys in code, logs, commits, or conversation output.

## Code Quality

- Produce maintainable code that a future engineer can understand without additional context.
- Avoid unnecessary complexity — do not build abstractions or generalize beyond what the task requires.
- Keep functions focused on a single responsibility.
- Minimize new dependencies; justify any addition against what already exists in the project.
- Preserve backward compatibility where practical.

## Testing

After implementation:

- Run linting.
- Run type checking.
- Run the available automated tests.
- Run the production build.
- Fix any issue introduced by the change before considering the work done.
- Explain how to manually test the feature or fix.

If any of these steps cannot be run, say so explicitly and explain why — never skip a step silently and report it as passing.

## Git

Never, unless explicitly instructed to do so:

- Commit
- Push
- Merge
- Rewrite Git history (rebase, force-push, amend published commits, etc.)

## Deployment

Never, without explicit approval:

- Deploy
- Modify production infrastructure
- Apply production migrations

Clearly distinguish between development, staging, and production when discussing any of the above.

## Security

Never:

- Disable authentication
- Disable authorization
- Weaken permissions or access controls
- Leak secrets, tokens, keys, or credentials
- Ignore or suppress security warnings to make something "work"

Explain the security implications of a change whenever they are relevant, even if not directly asked.

## Documentation

Whenever architecture changes:

- Update `README.md` if the change affects setup, usage, or project overview.
- Update `DEVELOPMENT_GUIDE.md` if the change affects system design, workflows, or anything else it documents.
- Update API documentation if the change affects request/response contracts or available endpoints.

## Communication

Before coding:

- Explain what currently exists.
- Explain the plan.
- Ask questions if requirements are ambiguous rather than guessing.

After coding:

- Summarize the changes made.
- List the files modified.
- Explain how the change was or can be tested.
- Mention any known limitations.
- Suggest further improvements only when genuinely relevant — not as a default filler.

## General Principle

Treat this application as production software at all times.

Prefer correctness, maintainability, security, and reliability over speed.

---

# Standard Production Deployment Framework

This section is the permanent, binding deployment process for this project. It applies to every AI assistant and every human contributor. See `DEPLOYMENT_PLAYBOOK.md` for the full reusable procedure and `DEPLOYMENT_CONFIG.example.md` for the per-project configuration template this framework was built around.

Required deployment order: **develop locally → validate locally → review changes → commit → push to GitHub → verify the push → deploy to the VPS by pulling from GitHub → verify production → produce a deployment report.**

**GitHub is the source of truth.** Never deploy local, uncommitted, or unpushed code directly to a server. The VPS only ever pulls from GitHub — it is never rsynced, scp'd, or hand-edited from a local machine.

### Local validation

Before any production deployment:

- Confirm the correct project and branch.
- Check Git status (`git status`).
- Identify all modified and untracked files.
- Run the project's configured lint command (`pnpm lint`).
- Run type checking when available. This project has no dedicated `typecheck` script — use `pnpm exec tsc --noEmit -p tsconfig.json` (the `typescript` devDependency covers this; `tsconfig.json` already sets `"noEmit": true`).
- Run all available automated tests (`pnpm test:unit`). Playwright (`pnpm test:e2e`) targets a deployed/preview URL, not local code, and requires live credentials — it is a **post-deploy** smoke check, not a pre-deploy gate.
- Run the production build (`pnpm build`, or `NITRO_PRESET=node-server pnpm build` for the Node/Hostinger target).
- Stop if any required check fails.
- Do not hide or ignore failures to continue deployment.

`scripts/predeploy-check.ps1` automates this checklist and can be run locally before requesting review.

### Change review

Before committing, report:

- Files changed
- Features and fixes included
- Database changes
- Migration files (see `supabase/migrations/`)
- Environment-variable changes
- New dependencies
- Breaking changes
- Security implications
- Deployment risks
- Rollback requirements

Wait for explicit approval before committing.

### Git and GitHub

After approval:

- Commit the reviewed changes using a clear commit message.
- Push the commit to the configured GitHub repository (`origin`).
- Verify that the push succeeded.
- Confirm the exact branch and commit hash now available on GitHub.
- Stop if the GitHub push fails.

Never deploy before the commit has been pushed successfully. Never deploy uncommitted code. Never deploy code that exists only on the local computer. GitHub is the source of truth for production deployment.

### VPS deployment

Only after the GitHub push is confirmed:

- Ask for explicit approval to deploy.
- Connect to the correct Hostinger VPS.
- Confirm the correct application directory before changing anything.
- Record the currently deployed Git commit before pulling.
- Pull the approved branch and commit from GitHub.
- Do not use force-pull, hard reset, or other destructive Git commands without approval.
- Use the package manager already configured by the project (pnpm — see `packageManager` in `package.json`).
- Install dependencies only when required.
- Apply only approved database migrations.
- Run the production build on the VPS when required (`NITRO_PRESET=node-server pnpm build` for the Node/Hostinger target).
- Restart or reload the correct PM2 process only.
- Do not restart unrelated applications.
- Verify Nginx configuration and status when relevant.
- Verify the application health endpoint (`/api/healthz`, see `src/routes/api/healthz.ts`).
- Check startup and application logs.
- Confirm the deployed Git commit matches the approved GitHub commit.

`scripts/deploy-from-github.sh.example` is a reference template for this sequence — a template only, never executed automatically.

### Production verification

After deployment, verify:

- PM2 process status
- Application port
- Nginx status
- HTTPS access
- Health endpoint
- Main login page
- Protected routes
- Database connection
- Critical API endpoints
- Application logs
- No immediate 5xx errors
- No unexpected redirect or refresh failure

### Rollback

Before deploying, identify:

- Previous production commit
- Rollback command
- Database rollback limitations
- Files or environment settings that may need restoration

If production verification fails:

- Stop further changes.
- Preserve logs.
- Explain the failure.
- Ask for approval before rolling back.
- Roll back to the previously recorded working Git commit when approved.
- Verify the application again after rollback.

### Required approvals

Always ask for explicit approval before:

- Committing
- Pushing to GitHub
- Deploying to the VPS
- Applying database migrations
- Changing environment variables
- Restarting or reconfiguring Nginx
- Deleting files
- Running destructive Git commands
- Rolling back production

Never combine these approvals into one vague approval — each is a separate decision point.
