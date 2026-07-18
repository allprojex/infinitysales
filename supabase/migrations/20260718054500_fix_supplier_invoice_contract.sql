ALTER TABLE public.supplier_invoices
  ADD COLUMN IF NOT EXISTS supplier_name text,
  ADD COLUMN IF NOT EXISTS po_number text,
  ADD COLUMN IF NOT EXISTS payment_date date,
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS payment_reference text;

UPDATE public.supplier_invoices si
SET po_number = po.reference
FROM public.purchase_orders po
WHERE si.purchase_order_id = po.id
  AND si.po_number IS NULL;

CREATE INDEX IF NOT EXISTS supplier_invoices_supplier_name_idx
  ON public.supplier_invoices (supplier_name);
