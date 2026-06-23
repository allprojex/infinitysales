-- Document and harden the customer UUID identifier used by sales and reports.
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS uuid_id uuid;

UPDATE public.customers
SET uuid_id = gen_random_uuid()
WHERE uuid_id IS NULL;

ALTER TABLE public.customers
  ALTER COLUMN uuid_id SET DEFAULT gen_random_uuid();

ALTER TABLE public.customers
  ALTER COLUMN uuid_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS customers_uuid_id_key
  ON public.customers(uuid_id);

NOTIFY pgrst, 'reload schema';
