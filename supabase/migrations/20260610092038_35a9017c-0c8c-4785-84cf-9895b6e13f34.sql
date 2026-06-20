
-- PRODUCTS
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name text NOT NULL,
  sku text,
  barcode text,
  category text,
  brand text,
  description text,
  unit text,
  price numeric(14,2) DEFAULT 0,
  cost numeric(14,2) DEFAULT 0,
  tax_rate numeric(6,3) DEFAULT 0,
  stock numeric(14,3) DEFAULT 0,
  reorder_level numeric(14,3) DEFAULT 0,
  warehouse_id uuid,
  branch_id uuid,
  image_url text,
  is_active boolean DEFAULT true,
  expiry_date date,
  attributes jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own products" ON public.products FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX products_user_idx ON public.products(user_id);
CREATE INDEX products_sku_idx ON public.products(user_id, sku);
CREATE INDEX products_barcode_idx ON public.products(user_id, barcode);
CREATE TRIGGER products_updated BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- PRICE LISTS
CREATE TABLE public.price_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  currency text DEFAULT 'USD',
  is_active boolean DEFAULT true,
  valid_from date,
  valid_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.price_lists TO authenticated;
GRANT ALL ON public.price_lists TO service_role;
ALTER TABLE public.price_lists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own price_lists" ON public.price_lists FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER price_lists_updated BEFORE UPDATE ON public.price_lists FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.price_list_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  price_list_id uuid NOT NULL REFERENCES public.price_lists(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  price numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.price_list_items TO authenticated;
GRANT ALL ON public.price_list_items TO service_role;
ALTER TABLE public.price_list_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own price_list_items" ON public.price_list_items FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- STOCK TAKES
CREATE TABLE public.stock_takes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  reference text,
  warehouse_id uuid,
  branch_id uuid,
  status text DEFAULT 'draft',
  notes text,
  counted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_takes TO authenticated;
GRANT ALL ON public.stock_takes TO service_role;
ALTER TABLE public.stock_takes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own stock_takes" ON public.stock_takes FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER stock_takes_updated BEFORE UPDATE ON public.stock_takes FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.stock_take_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  stock_take_id uuid NOT NULL REFERENCES public.stock_takes(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  expected numeric(14,3) DEFAULT 0,
  counted numeric(14,3) DEFAULT 0,
  variance numeric(14,3) DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_take_items TO authenticated;
GRANT ALL ON public.stock_take_items TO service_role;
ALTER TABLE public.stock_take_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own stock_take_items" ON public.stock_take_items FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- STOCK ADJUSTMENTS
CREATE TABLE public.stock_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  warehouse_id uuid,
  branch_id uuid,
  quantity numeric(14,3) NOT NULL DEFAULT 0,
  reason text,
  reference text,
  notes text,
  adjusted_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_adjustments TO authenticated;
GRANT ALL ON public.stock_adjustments TO service_role;
ALTER TABLE public.stock_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own stock_adjustments" ON public.stock_adjustments FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER stock_adjustments_updated BEFORE UPDATE ON public.stock_adjustments FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- SERIAL NUMBERS
CREATE TABLE public.serial_numbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  serial text NOT NULL,
  status text DEFAULT 'available',
  warehouse_id uuid,
  branch_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.serial_numbers TO authenticated;
GRANT ALL ON public.serial_numbers TO service_role;
ALTER TABLE public.serial_numbers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own serial_numbers" ON public.serial_numbers FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER serial_numbers_updated BEFORE UPDATE ON public.serial_numbers FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- REORDER RULES
CREATE TABLE public.reorder_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  warehouse_id uuid,
  min_quantity numeric(14,3) DEFAULT 0,
  max_quantity numeric(14,3) DEFAULT 0,
  reorder_quantity numeric(14,3) DEFAULT 0,
  supplier_id uuid,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reorder_rules TO authenticated;
GRANT ALL ON public.reorder_rules TO service_role;
ALTER TABLE public.reorder_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own reorder_rules" ON public.reorder_rules FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER reorder_rules_updated BEFORE UPDATE ON public.reorder_rules FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- PRODUCT TRANSFERS
CREATE TABLE public.product_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  reference text,
  from_warehouse_id uuid,
  to_warehouse_id uuid,
  from_branch_id uuid,
  to_branch_id uuid,
  status text DEFAULT 'pending',
  notes text,
  items jsonb DEFAULT '[]'::jsonb,
  transferred_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_transfers TO authenticated;
GRANT ALL ON public.product_transfers TO service_role;
ALTER TABLE public.product_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own product_transfers" ON public.product_transfers FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER product_transfers_updated BEFORE UPDATE ON public.product_transfers FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ESL
CREATE TABLE public.esl_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  device_id text NOT NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  branch_id uuid,
  status text DEFAULT 'active',
  battery integer,
  last_synced_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.esl_devices TO authenticated;
GRANT ALL ON public.esl_devices TO service_role;
ALTER TABLE public.esl_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own esl_devices" ON public.esl_devices FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER esl_devices_updated BEFORE UPDATE ON public.esl_devices FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.esl_sync_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  device_id text,
  status text,
  message text,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.esl_sync_history TO authenticated;
GRANT ALL ON public.esl_sync_history TO service_role;
ALTER TABLE public.esl_sync_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own esl_sync_history" ON public.esl_sync_history FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
