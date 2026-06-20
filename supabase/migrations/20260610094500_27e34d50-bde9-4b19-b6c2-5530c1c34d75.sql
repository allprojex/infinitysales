
-- USER TAX RATES (one row per user)
CREATE TABLE public.user_tax_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  vat_rate NUMERIC(6,3) NOT NULL DEFAULT 15,
  nhil_rate NUMERIC(6,3) NOT NULL DEFAULT 2.5,
  getfund_rate NUMERIC(6,3) NOT NULL DEFAULT 2.5,
  covid_levy NUMERIC(6,3) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_tax_rates TO authenticated;
GRANT ALL ON public.user_tax_rates TO service_role;
ALTER TABLE public.user_tax_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own tax rates" ON public.user_tax_rates FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_tax_rates_updated BEFORE UPDATE ON public.user_tax_rates FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- RECYCLE BIN
CREATE TABLE public.recycle_bin (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_name TEXT,
  entity_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  deleted_by_id UUID,
  deleted_by_name TEXT,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX recycle_bin_user_idx ON public.recycle_bin(user_id, deleted_at DESC);
CREATE INDEX recycle_bin_entity_idx ON public.recycle_bin(user_id, entity_type);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recycle_bin TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.recycle_bin_id_seq TO authenticated;
GRANT ALL ON public.recycle_bin TO service_role;
ALTER TABLE public.recycle_bin ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own recycle bin" ON public.recycle_bin FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- LABEL PRINT JOBS
CREATE TABLE public.label_print_jobs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  printer_id TEXT,
  printer_name TEXT,
  label_type TEXT,
  copies INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'completed',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX label_jobs_user_idx ON public.label_print_jobs(user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.label_print_jobs TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.label_print_jobs_id_seq TO authenticated;
GRANT ALL ON public.label_print_jobs TO service_role;
ALTER TABLE public.label_print_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own label jobs" ON public.label_print_jobs FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_label_jobs_updated BEFORE UPDATE ON public.label_print_jobs FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
