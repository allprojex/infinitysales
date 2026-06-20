# Infinity Sales Pro

POS, inventory, HR, accounting, and analytics platform built on TanStack Start, React 19, Tailwind v4, and Lovable Cloud (Supabase).

## Package Manager

This project uses **pnpm** only. Do not use npm or Bun — mixing managers will produce inconsistent installs and a broken build.

### Install & build

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm build
```

The `packageManager` field in `package.json` pins pnpm `9.15.0`; Corepack will fetch the exact version automatically.

### Production output

The Vite + Nitro build emits the deployable bundle to `dist/`:

- `dist/client/` — static assets (HTML, JS, CSS, images)
- `dist/server/index.mjs` — server entry
- `dist/server/wrangler.json` — Cloudflare Workers config (default Nitro preset)

Start the production server (Node):

```bash
pnpm start
```

> The default Nitro preset targets Cloudflare Workers. For a plain Node host (e.g. Hostinger Cloud/Shared Node hosting), set `NITRO_PRESET=node-server` before `pnpm build`, which makes `dist/server/index.mjs` a standalone Node listener.

### Local development

```bash
pnpm dev          # vite dev server (default http://localhost:8080)
pnpm lint         # eslint
pnpm test:e2e     # playwright
```

## Hostinger deployment (Cloud / Shared Node hosting, hPanel)

1. In hPanel, create a Node.js application and set **Node 20.x**.
2. Open the SSH terminal for the app and clone or upload the repo.
3. Build with the Node preset:
   ```bash
   corepack enable
   pnpm install --frozen-lockfile
   NITRO_PRESET=node-server pnpm build
   ```
4. Set the **application startup file** to `dist/server/index.mjs`.
5. Configure environment variables (copy from `.env.example`):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `VITE_SUPABASE_PROJECT_ID`
   - `LOVABLE_API_KEY`
   - `AI_PROXY_SECRET`
   - any additional secrets your deployment requires
6. Restart the Node app from hPanel.

## Project structure

- `src/routes/` — file-based TanStack routes (pages + `api/` server routes)
- `src/components/` — UI components (shadcn-based)
- `src/integrations/supabase/` — auto-generated Supabase client/types (do not edit)
- `supabase/` — migrations and edge functions
- `e2e/` — Playwright end-to-end tests

## Accessing the Backend

The project database, auth users, and storage are managed through **Lovable Cloud**.

1. Open the project in the Lovable editor.
2. Click **View Backend** (top navigation bar) to open the backend panel.
3. Use the tabs inside the panel to browse:
   - **Database** — view tables, run queries, and manage rows.
   - **Users** — list auth users, edit roles, and configure sign-in methods.
   - **Storage** — upload and manage files in storage buckets.

No separate Supabase account or dashboard is required; everything is handled within the Lovable editor.

## License

Private / proprietary.
