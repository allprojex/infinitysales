
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname='public' AND 'public'=ANY(roles)
      AND qual='(auth.uid() = user_id)'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)', r.policyname, r.tablename);
  END LOOP;
END $$;

-- Lock down SECURITY DEFINER functions: revoke default PUBLIC EXECUTE.
-- has_role is called from RLS policies (runs as the table owner internally), so revoking from anon/public API is safe.
-- handle_new_user and prevent_sensitive_profile_changes are trigger functions; revoking EXECUTE doesn't affect trigger invocation.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.prevent_sensitive_profile_changes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
