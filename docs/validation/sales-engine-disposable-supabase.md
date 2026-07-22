# Sales Engine disposable Supabase validation

This runbook must be executed only against a project that will be discarded. The repository's configured project reference, `vcgtjdkpgbkyzrbonkbs`, is protected by the validation script and must never be used.

## Current execution status

- Supabase CLI `2.107.0` is installed.
- Docker is not installed or available, so local Supabase cannot currently start.
- No migration, type generation, or integration validation was run against the configured project.
- The Sales Returns stash remains untouched.

## Option 1: disposable hosted project (works without Docker)

1. In the Supabase dashboard, create a new empty project specifically for this validation. Record its project reference, database password, project URL, publishable key, and service-role key.
2. In **Connect**, copy the Session pooler database URI. Use the pooler URI if the direct database hostname is inaccessible over IPv6. Replace `[YOUR-PASSWORD]` locally; do not save the URI or keys in the repository.
3. Open PowerShell in the repository and set process-only variables:

   ```powershell
   $env:DISPOSABLE_SUPABASE_PROJECT_REF = '<disposable-project-ref>'
   $env:DISPOSABLE_DATABASE_URL = '<session-pooler-database-uri>'
   $env:SUPABASE_ACCESS_TOKEN = '<personal-access-token>'
   $env:SUPABASE_PROJECT_ID = $env:DISPOSABLE_SUPABASE_PROJECT_REF
   $env:SUPABASE_URL = 'https://<disposable-project-ref>.supabase.co'
   $env:SUPABASE_PUBLISHABLE_KEY = '<disposable-publishable-key>'
   $env:SUPABASE_SERVICE_ROLE_KEY = '<disposable-service-role-key>'
   $env:SALES_ENGINE_DISPOSABLE_CONFIRM = 'I_UNDERSTAND_THIS_PROJECT_WILL_BE_DISCARDED'
   $env:APP_BASE_URL = 'http://127.0.0.1:3000'
   ```

4. Verify the target before changing it:

   ```powershell
   if ($env:DISPOSABLE_SUPABASE_PROJECT_REF -eq 'vcgtjdkpgbkyzrbonkbs') { throw 'Production/configured project rejected' }
   supabase migration list --db-url $env:DISPOSABLE_DATABASE_URL
   ```

5. Apply the repository migration chain to the empty disposable database. This includes the Sales Engine Foundation migration; it does not link or rewrite `supabase/config.toml`:

   ```powershell
   supabase db push --db-url $env:DISPOSABLE_DATABASE_URL --include-all
   supabase migration list --db-url $env:DISPOSABLE_DATABASE_URL
   ```

6. Generate types from the disposable project and run the complete local checks:

   ```powershell
   pnpm supabase:types
   pnpm test:unit
   pnpm build
   ```

7. Start the application in a separate PowerShell window with the same `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` values:

   ```powershell
   pnpm dev --host 127.0.0.1 --port 3000
   ```

8. From the first window, execute the destructive disposable-only integration suite:

   ```powershell
   pnpm validate:sales-engine:disposable
   ```

   The suite refuses the repository's configured project reference. It verifies canonical creation, four concurrent retries, single inventory/customer/receivable/audit effects, service-role and authenticated append protection, owner/outsider RLS, exact canonical restore, and all three Phase A reports after the mutable product record is edited.

9. Review the generated Supabase type diff. Retain it only if it was generated from the successfully migrated disposable schema.
10. Delete the disposable Supabase project. The validation intentionally leaves immutable canonical test records behind, so destroying the whole project is the cleanup mechanism.

## Option 2: local Supabase after Docker is installed

1. Install and start Docker Desktop.
2. In PowerShell, start and reset local Supabase:

   ```powershell
   supabase start
   supabase db reset
   $env:SUPABASE_LOCAL = 'true'
   pnpm supabase:types
   supabase status
   ```

3. Copy the local API URL, anon/publishable key, and service-role key from `supabase status` into the environment variables used above. Set `DISPOSABLE_SUPABASE_PROJECT_REF` to `local` and set `APP_BASE_URL` to the running application.
4. Run `pnpm test:unit`, `pnpm build`, start the app, and run `pnpm validate:sales-engine:disposable`.
5. Stop and remove the disposable local stack when finished:

   ```powershell
   supabase stop --no-backup
   ```

The validation target guard accepts only `localhost`/`127.0.0.1` when the project reference is `local`. The hosted disposable path remains the recommended Docker-free route.
