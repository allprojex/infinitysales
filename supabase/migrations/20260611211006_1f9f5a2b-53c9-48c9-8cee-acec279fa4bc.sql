GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;

DROP POLICY IF EXISTS "authenticated users can view all products" ON public.products;
CREATE POLICY "authenticated users can view all products"
ON public.products
FOR SELECT
TO authenticated
USING (true);