
CREATE TABLE public.sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  reference text,
  customer_id uuid,
  branch_id uuid,
  warehouse_id uuid,
  cash_session_id uuid,
  channel text DEFAULT 'pos',
  status text DEFAULT 'completed',
  payment_status text DEFAULT 'paid',
  payment_method text,
  subtotal numeric(14,2) DEFAULT 0,
  tax numeric(14,2) DEFAULT 0,
  discount numeric(14,2) DEFAULT 0,
  total numeric(14,2) DEFAULT 0,
  paid numeric(14,2) DEFAULT 0,
  change_due numeric(14,2) DEFAULT 0,
  items jsonb DEFAULT '[]'::jsonb,
  notes text,
  sold_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales TO authenticated;
GRANT ALL ON public.sales TO service_role;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sales" ON public.sales FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX sales_user_sold_idx ON public.sales(user_id, sold_at DESC);
CREATE TRIGGER sales_updated BEFORE UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.quotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  reference text,
  customer_id uuid,
  status text DEFAULT 'draft',
  subtotal numeric(14,2) DEFAULT 0,
  tax numeric(14,2) DEFAULT 0,
  discount numeric(14,2) DEFAULT 0,
  total numeric(14,2) DEFAULT 0,
  items jsonb DEFAULT '[]'::jsonb,
  notes text,
  valid_until date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotations TO authenticated;
GRANT ALL ON public.quotations TO service_role;
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own quotations" ON public.quotations FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER quotations_updated BEFORE UPDATE ON public.quotations FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.cash_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  branch_id uuid,
  cashier_id uuid,
  opening_balance numeric(14,2) DEFAULT 0,
  closing_balance numeric(14,2),
  expected_balance numeric(14,2),
  difference numeric(14,2),
  status text DEFAULT 'open',
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_sessions TO authenticated;
GRANT ALL ON public.cash_sessions TO service_role;
ALTER TABLE public.cash_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own cash_sessions" ON public.cash_sessions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER cash_sessions_updated BEFORE UPDATE ON public.cash_sessions FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.pos_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name text NOT NULL,
  device_type text,
  address text,
  port integer,
  branch_id uuid,
  status text DEFAULT 'disconnected',
  last_connected_at timestamptz,
  config jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_connections TO authenticated;
GRANT ALL ON public.pos_connections TO service_role;
ALTER TABLE public.pos_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own pos_connections" ON public.pos_connections FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER pos_connections_updated BEFORE UPDATE ON public.pos_connections FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  type text DEFAULT 'percent',
  value numeric(14,2) DEFAULT 0,
  min_purchase numeric(14,2) DEFAULT 0,
  starts_at timestamptz,
  ends_at timestamptz,
  usage_limit integer,
  used_count integer DEFAULT 0,
  is_active boolean DEFAULT true,
  applies_to jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.promotions TO authenticated;
GRANT ALL ON public.promotions TO service_role;
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own promotions" ON public.promotions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER promotions_updated BEFORE UPDATE ON public.promotions FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.loyalty_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  customer_id uuid NOT NULL,
  type text NOT NULL, -- earn | redeem | adjust
  points numeric(14,2) NOT NULL DEFAULT 0,
  reference text,
  sale_id uuid,
  notes text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loyalty_transactions TO authenticated;
GRANT ALL ON public.loyalty_transactions TO service_role;
ALTER TABLE public.loyalty_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own loyalty_transactions" ON public.loyalty_transactions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX loyalty_customer_idx ON public.loyalty_transactions(user_id, customer_id);

CREATE TABLE public.customer_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  customer_id uuid NOT NULL,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  type text DEFAULT 'credit', -- credit | debit
  reference text,
  notes text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_credits TO authenticated;
GRANT ALL ON public.customer_credits TO service_role;
ALTER TABLE public.customer_credits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own customer_credits" ON public.customer_credits FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX credits_customer_idx ON public.customer_credits(user_id, customer_id);
CREATE TRIGGER customer_credits_updated BEFORE UPDATE ON public.customer_credits FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
