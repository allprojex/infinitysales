-- Fix: admins cannot disable/enable users (toggle is_locked) via the admin panel.
--
-- Root cause: public.profiles has a BEFORE UPDATE trigger
-- (protect_sensitive_profile_fields -> prevent_sensitive_profile_changes) that blocks
-- changes to is_locked / must_change_password / two_factor_enabled / auth_id / email
-- unless public.has_role(auth.uid(), 'admin') is true.
--
-- The admin panel's server routes (/api/auth/admin/toggle-lock, /api/auth/admin/set-lock)
-- already gate access with requireAdmin() in application code, then update the row using
-- the service-role Supabase client (supabaseAdmin), which is the correct pattern for
-- server-side admin actions and intentionally bypasses RLS.
--
-- However, triggers still fire for service-role connections even though RLS is bypassed.
-- auth.uid() resolves from the request JWT's "sub" claim; the service-role key carries no
-- such user claim, so auth.uid() is always NULL for these calls. That makes
-- has_role(auth.uid(), 'admin') always evaluate to false, so the trigger raises
-- 'Not authorized to modify protected profile fields' for every admin, every time -
-- this update path has never worked.
--
-- Fix: also allow the change when the connecting Postgres role's JWT claims identify it as
-- the service_role (auth.role() = 'service_role'). This is the standard Supabase idiom for
-- distinguishing the trusted server-side service key from an end user's session, and it is
-- narrower than granting blanket trigger bypass: only requests made with the service-role key
-- (which never leaves the server and is already gated by requireAdmin in the API layer) skip
-- the has_role check. Direct client-side calls from a logged-in non-admin user still go through
-- auth.uid() + has_role and are still blocked, so RLS-equivalent protection for end users is
-- unchanged. No RLS policies and no application authorization logic are touched by this migration.

CREATE OR REPLACE FUNCTION public.prevent_sensitive_profile_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    IF NEW.is_locked IS DISTINCT FROM OLD.is_locked
       OR NEW.must_change_password IS DISTINCT FROM OLD.must_change_password
       OR NEW.two_factor_enabled IS DISTINCT FROM OLD.two_factor_enabled
       OR NEW.auth_id IS DISTINCT FROM OLD.auth_id
       OR NEW.email IS DISTINCT FROM OLD.email THEN
      RAISE EXCEPTION 'Not authorized to modify protected profile fields';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Rollback (reverse migration): restore the original function body, i.e. remove the
-- "auth.role() <> 'service_role' AND" clause so only has_role(auth.uid(), 'admin') gates
-- the protected fields again:
--
-- CREATE OR REPLACE FUNCTION public.prevent_sensitive_profile_changes()
-- RETURNS TRIGGER
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path = public
-- AS $$
-- BEGIN
--   IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
--     IF NEW.is_locked IS DISTINCT FROM OLD.is_locked
--        OR NEW.must_change_password IS DISTINCT FROM OLD.must_change_password
--        OR NEW.two_factor_enabled IS DISTINCT FROM OLD.two_factor_enabled
--        OR NEW.auth_id IS DISTINCT FROM OLD.auth_id
--        OR NEW.email IS DISTINCT FROM OLD.email THEN
--       RAISE EXCEPTION 'Not authorized to modify protected profile fields';
--     END IF;
--   END IF;
--   RETURN NEW;
-- END;
-- $$;
