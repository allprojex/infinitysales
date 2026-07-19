-- Add a UUID identifier to suppliers, mirroring the existing customers/warehouses
-- pattern (see 20260623171000_add_customers_uuid_id.sql). Needed because
-- reorder_rules.supplier_id is a uuid column but suppliers previously had no
-- uuid form of its identity to store there, making it impossible to attach a
-- preferred supplier to a reorder rule (every attempt failed with
-- "invalid input syntax for type uuid").
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS uuid_id uuid;

UPDATE public.suppliers
SET uuid_id = gen_random_uuid()
WHERE uuid_id IS NULL;

ALTER TABLE public.suppliers
  ALTER COLUMN uuid_id SET DEFAULT gen_random_uuid();

ALTER TABLE public.suppliers
  ALTER COLUMN uuid_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS suppliers_uuid_id_key
  ON public.suppliers(uuid_id);

NOTIFY pgrst, 'reload schema';
