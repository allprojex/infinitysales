DROP POLICY IF EXISTS "Users can manage own ip blocks" ON public.ip_blocks;
DROP POLICY IF EXISTS "ip_blocks_owner" ON public.ip_blocks;
DROP POLICY IF EXISTS "Users manage their ip blocks" ON public.ip_blocks;

REVOKE ALL ON public.ip_blocks FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ip_blocks TO authenticated;
GRANT ALL ON public.ip_blocks TO service_role;

CREATE POLICY "ip_blocks owner all"
  ON public.ip_blocks
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);