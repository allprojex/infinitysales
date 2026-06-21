GRANT SELECT ON public.products TO authenticated;

DROP POLICY IF EXISTS "authenticated users can view all products" ON public.products;
CREATE POLICY "authenticated users can view all products"
  ON public.products
  FOR SELECT
  TO authenticated
  USING (true);
