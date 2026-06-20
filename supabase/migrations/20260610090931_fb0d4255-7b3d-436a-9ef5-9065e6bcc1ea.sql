
-- 1. profiles: admin-only INSERT/DELETE policies
CREATE POLICY "Admins can insert profiles" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can delete profiles" ON public.profiles
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 2. profiles: prevent non-admins from changing sensitive fields via trigger
CREATE OR REPLACE FUNCTION public.prevent_sensitive_profile_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
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

DROP TRIGGER IF EXISTS protect_sensitive_profile_fields ON public.profiles;
CREATE TRIGGER protect_sensitive_profile_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_sensitive_profile_changes();

-- 3. user_roles: admin-only INSERT/UPDATE/DELETE
CREATE POLICY "Admins can insert roles" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can update roles" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can delete roles" ON public.user_roles
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 4. Revoke direct EXECUTE on has_role from client roles (linter warning).
-- RLS policies still evaluate it because policy expressions run with table-owner privileges.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
