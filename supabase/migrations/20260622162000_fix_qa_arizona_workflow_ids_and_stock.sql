-- Align numeric shop/warehouse UI IDs with UUID stock/sales ledger columns.

ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS uuid_id uuid NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE public.warehouses
  ADD COLUMN IF NOT EXISTS uuid_id uuid NOT NULL DEFAULT gen_random_uuid();

UPDATE public.branches SET uuid_id = gen_random_uuid() WHERE uuid_id IS NULL;
UPDATE public.warehouses SET uuid_id = gen_random_uuid() WHERE uuid_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS branches_uuid_id_key ON public.branches(uuid_id);
CREATE UNIQUE INDEX IF NOT EXISTS warehouses_uuid_id_key ON public.warehouses(uuid_id);

CREATE TABLE IF NOT EXISTS public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  warehouse_id uuid,
  movement_type text NOT NULL,
  quantity numeric NOT NULL,
  unit_cost numeric,
  balance_after numeric NOT NULL DEFAULT 0,
  reference_type text,
  reference_id uuid,
  reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_movements TO authenticated;
GRANT ALL ON public.stock_movements TO service_role;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own stock_movements" ON public.stock_movements;
CREATE POLICY "own stock_movements" ON public.stock_movements
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS stock_movements_product_warehouse_idx
  ON public.stock_movements(user_id, product_id, warehouse_id, created_at DESC);

CREATE INDEX IF NOT EXISTS stock_movements_reference_idx
  ON public.stock_movements(reference_type, reference_id);
