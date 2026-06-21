-- Align admin procurement/accounting forms with the columns the app already sends.
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS city text;

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS expense_date date,
  ADD COLUMN IF NOT EXISTS receipt_note text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS created_by uuid;

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS supplier_name text,
  ADD COLUMN IF NOT EXISTS received_date date;

UPDATE public.expenses
SET
  title = COALESCE(title, reference, category, 'Expense'),
  expense_date = COALESCE(expense_date, spent_at::date, created_at::date),
  receipt_note = COALESCE(receipt_note, reference),
  status = COALESCE(status, 'pending')
WHERE title IS NULL
   OR expense_date IS NULL
   OR receipt_note IS NULL
   OR status IS NULL;

UPDATE public.purchase_orders po
SET supplier_name = COALESCE(po.supplier_name, s.name)
FROM public.suppliers s
WHERE po.supplier_name IS NULL
  AND po.supplier_id::text = s.id::text;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.branches TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_orders TO authenticated;

DROP POLICY IF EXISTS "authenticated users can view all branches" ON public.branches;
CREATE POLICY "authenticated users can view all branches"
  ON public.branches
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "authenticated users can view all suppliers" ON public.suppliers;
CREATE POLICY "authenticated users can view all suppliers"
  ON public.suppliers
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "authenticated users can view all expenses" ON public.expenses;
CREATE POLICY "authenticated users can view all expenses"
  ON public.expenses
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "authenticated users can view all purchase orders" ON public.purchase_orders;
CREATE POLICY "authenticated users can view all purchase orders"
  ON public.purchase_orders
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "admins can write branches" ON public.branches;
CREATE POLICY "admins can write branches"
  ON public.branches
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "admins can write suppliers" ON public.suppliers;
CREATE POLICY "admins can write suppliers"
  ON public.suppliers
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "admins can write expenses" ON public.expenses;
CREATE POLICY "admins can write expenses"
  ON public.expenses
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "admins can write purchase orders" ON public.purchase_orders;
CREATE POLICY "admins can write purchase orders"
  ON public.purchase_orders
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

NOTIFY pgrst, 'reload schema';
