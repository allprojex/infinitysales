DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can update own profile (safe fields only)"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth_id = auth.uid())
WITH CHECK (
  auth_id = auth.uid()
  AND is_locked = (SELECT p.is_locked FROM public.profiles p WHERE p.id = profiles.id)
  AND must_change_password = (SELECT p.must_change_password FROM public.profiles p WHERE p.id = profiles.id)
  AND two_factor_enabled = (SELECT p.two_factor_enabled FROM public.profiles p WHERE p.id = profiles.id)
  AND email = (SELECT p.email FROM public.profiles p WHERE p.id = profiles.id)
);