ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS batch_lot_number text;

COMMENT ON COLUMN public.products.batch_lot_number IS 'Manufacturer batch or lot identifier for traceability.';