-- Production purchase-return workflow built on the existing purchase_orders,
-- products and stock_movements ledgers.

ALTER TABLE public.purchase_returns
  ADD COLUMN IF NOT EXISTS return_number text,
  ADD COLUMN IF NOT EXISTS warehouse_id uuid,
  ADD COLUMN IF NOT EXISTS settlement_type text NOT NULL DEFAULT 'no_immediate_settlement',
  ADD COLUMN IF NOT EXISTS reason_summary text,
  ADD COLUMN IF NOT EXISTS discount_amount numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_amount numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_amount numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refunded_amount numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credited_amount numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS outstanding_amount numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS supplier_reference text,
  ADD COLUMN IF NOT EXISTS debit_note_number text,
  ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS reversed_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reversal_reason text,
  ADD COLUMN IF NOT EXISTS reversal_of uuid REFERENCES public.purchase_returns(id),
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

UPDATE public.purchase_returns
SET return_number = COALESCE(return_number, reference, 'PR-' || to_char(created_at, 'YYYY') || '-' || lpad(row_number::text, 6, '0')),
    tax_amount = COALESCE(tax_amount, tax, 0),
    total_amount = COALESCE(NULLIF(total_amount, 0), total, 0),
    reason_summary = COALESCE(reason_summary, reason),
    created_by = COALESCE(created_by, user_id)
FROM (
  SELECT id, row_number() OVER (PARTITION BY date_part('year', created_at) ORDER BY created_at, id) AS row_number
  FROM public.purchase_returns
) numbered
WHERE purchase_returns.id = numbered.id;

UPDATE public.purchase_returns SET status = 'pending_approval' WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS purchase_returns_return_number_key ON public.purchase_returns(return_number);
CREATE INDEX IF NOT EXISTS purchase_returns_purchase_status_idx ON public.purchase_returns(purchase_order_id, status);
CREATE INDEX IF NOT EXISTS purchase_returns_supplier_date_idx ON public.purchase_returns(supplier_id, returned_at DESC);
CREATE INDEX IF NOT EXISTS purchase_returns_warehouse_idx ON public.purchase_returns(warehouse_id, status);

CREATE TABLE IF NOT EXISTS public.purchase_return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_return_id uuid NOT NULL REFERENCES public.purchase_returns(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  variant_id uuid,
  batch_id uuid,
  warehouse_id uuid,
  product_name text NOT NULL,
  sku text,
  category_id uuid,
  category_name text,
  quantity_purchased numeric(14,3) NOT NULL CHECK (quantity_purchased >= 0),
  quantity_previously_returned numeric(14,3) NOT NULL DEFAULT 0 CHECK (quantity_previously_returned >= 0),
  quantity_returned numeric(14,3) NOT NULL CHECK (quantity_returned > 0),
  unit_cost numeric(14,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  tax_rate numeric(8,4) NOT NULL DEFAULT 0,
  tax_amount numeric(14,2) NOT NULL DEFAULT 0,
  discount_amount numeric(14,2) NOT NULL DEFAULT 0,
  line_total numeric(14,2) NOT NULL DEFAULT 0 CHECK (line_total >= 0),
  reason text NOT NULL,
  item_condition text NOT NULL,
  other_explanation text,
  notes text,
  serial_numbers jsonb NOT NULL DEFAULT '[]'::jsonb,
  expiry_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT purchase_return_other_reason_check CHECK (
    (reason <> 'Other' AND item_condition <> 'Other') OR length(trim(COALESCE(other_explanation, ''))) > 0
  )
);

CREATE INDEX IF NOT EXISTS purchase_return_items_return_idx ON public.purchase_return_items(purchase_return_id);
CREATE INDEX IF NOT EXISTS purchase_return_items_eligibility_idx ON public.purchase_return_items(product_id, warehouse_id, purchase_return_id);
CREATE TRIGGER purchase_return_items_updated_at BEFORE UPDATE ON public.purchase_return_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.purchase_return_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_return_id uuid NOT NULL REFERENCES public.purchase_returns(id) ON DELETE RESTRICT,
  settlement_type text NOT NULL CHECK (settlement_type IN (
    'reduce_supplier_balance','cash_refund','bank_refund','mobile_money_refund',
    'supplier_credit','replacement_goods','no_immediate_settlement'
  )),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  payment_method text,
  account_id uuid,
  transaction_reference text,
  settlement_date date NOT NULL DEFAULT current_date,
  notes text,
  status text NOT NULL DEFAULT 'posted' CHECK (status IN ('pending','posted','reversed')),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  reversed_by uuid REFERENCES auth.users(id),
  reversed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS purchase_return_settlements_return_idx ON public.purchase_return_settlements(purchase_return_id, created_at);

GRANT SELECT, INSERT, UPDATE ON public.purchase_return_items TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.purchase_return_settlements TO authenticated;
GRANT ALL ON public.purchase_return_items, public.purchase_return_settlements TO service_role;
ALTER TABLE public.purchase_return_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_return_settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "purchase return items through owner" ON public.purchase_return_items;
CREATE POLICY "purchase return items through owner" ON public.purchase_return_items FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.purchase_returns r WHERE r.id = purchase_return_id AND (r.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))));
DROP POLICY IF EXISTS "purchase return settlements through owner" ON public.purchase_return_settlements;
CREATE POLICY "purchase return settlements through owner" ON public.purchase_return_settlements FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.purchase_returns r WHERE r.id = purchase_return_id AND (r.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))));

CREATE SEQUENCE IF NOT EXISTS public.purchase_return_number_seq;
CREATE OR REPLACE FUNCTION public.next_purchase_return_number()
RETURNS text LANGUAGE sql VOLATILE SET search_path = public AS $$
  SELECT 'PR-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('public.purchase_return_number_seq')::text, 6, '0')
$$;
ALTER TABLE public.purchase_returns ALTER COLUMN return_number SET DEFAULT public.next_purchase_return_number();

CREATE OR REPLACE FUNCTION public.complete_purchase_return(p_return_id uuid, p_actor uuid)
RETURNS public.purchase_returns
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.purchase_returns%ROWTYPE;
  i public.purchase_return_items%ROWTYPE;
  v_available numeric;
  v_stock numeric;
  v_balance numeric;
BEGIN
  SELECT * INTO r FROM public.purchase_returns WHERE id = p_return_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase return not found'; END IF;
  IF r.status = 'completed' THEN RAISE EXCEPTION 'This purchase return has already been completed'; END IF;
  IF r.status <> 'approved' THEN RAISE EXCEPTION 'Only an approved purchase return can be completed'; END IF;

  PERFORM 1 FROM public.purchase_orders WHERE id = r.purchase_order_id FOR UPDATE;
  FOR i IN SELECT * FROM public.purchase_return_items WHERE purchase_return_id = r.id ORDER BY id FOR UPDATE LOOP
    SELECT i.quantity_purchased - COALESCE(sum(ri.quantity_returned), 0)
      INTO v_available
    FROM public.purchase_return_items ri
    JOIN public.purchase_returns pr ON pr.id = ri.purchase_return_id
    WHERE pr.purchase_order_id = r.purchase_order_id
      AND ri.product_id = i.product_id
      AND ri.id <> i.id
      AND pr.status IN ('pending_approval','approved','completed');
    IF i.quantity_returned > v_available THEN
      RAISE EXCEPTION 'Return quantity for % cannot exceed % units', i.product_name, v_available;
    END IF;

    SELECT COALESCE(sum(quantity), 0) INTO v_stock
    FROM public.stock_movements
    WHERE user_id = r.user_id AND product_id = i.product_id
      AND warehouse_id IS NOT DISTINCT FROM COALESCE(i.warehouse_id, r.warehouse_id);
    IF v_stock < i.quantity_returned THEN
      RAISE EXCEPTION 'Only % units of % are available in the selected warehouse', v_stock, i.product_name;
    END IF;

    v_balance := v_stock - i.quantity_returned;
    INSERT INTO public.stock_movements(
      user_id, product_id, warehouse_id, movement_type, quantity, unit_cost,
      balance_after, reference_type, reference_id, reason, created_by
    ) VALUES (
      r.user_id, i.product_id, COALESCE(i.warehouse_id, r.warehouse_id), 'PURCHASE_RETURN',
      -i.quantity_returned, i.unit_cost, v_balance, 'purchase_return', r.id,
      i.reason || ': ' || r.return_number, p_actor
    );
    UPDATE public.products SET stock = GREATEST(COALESCE(stock, 0) - i.quantity_returned, 0)
    WHERE id = i.product_id;
  END LOOP;

  UPDATE public.purchase_returns
  SET status = 'completed', completed_by = p_actor, completed_at = now(),
      outstanding_amount = GREATEST(total_amount - refunded_amount - credited_amount, 0),
      updated_at = now()
  WHERE id = r.id RETURNING * INTO r;
  RETURN r;
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_purchase_return(p_return_id uuid, p_actor uuid, p_reason text)
RETURNS public.purchase_returns
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.purchase_returns%ROWTYPE;
  i public.purchase_return_items%ROWTYPE;
  v_balance numeric;
BEGIN
  IF length(trim(COALESCE(p_reason, ''))) < 3 THEN RAISE EXCEPTION 'A reversal reason is required'; END IF;
  SELECT * INTO r FROM public.purchase_returns WHERE id = p_return_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase return not found'; END IF;
  IF r.status = 'reversed' THEN RAISE EXCEPTION 'This purchase return has already been reversed'; END IF;
  IF r.status <> 'completed' THEN RAISE EXCEPTION 'Only a completed purchase return can be reversed'; END IF;
  IF EXISTS (SELECT 1 FROM public.purchase_return_settlements WHERE purchase_return_id = r.id AND status = 'posted' AND settlement_type IN ('cash_refund','bank_refund','mobile_money_refund')) THEN
    RAISE EXCEPTION 'Resolve posted cash, bank or Mobile Money refunds before reversal';
  END IF;
  FOR i IN SELECT * FROM public.purchase_return_items WHERE purchase_return_id = r.id LOOP
    SELECT COALESCE(sum(quantity), 0) + i.quantity_returned INTO v_balance
    FROM public.stock_movements WHERE user_id = r.user_id AND product_id = i.product_id
      AND warehouse_id IS NOT DISTINCT FROM COALESCE(i.warehouse_id, r.warehouse_id);
    INSERT INTO public.stock_movements(user_id,product_id,warehouse_id,movement_type,quantity,unit_cost,balance_after,reference_type,reference_id,reason,created_by)
    VALUES(r.user_id,i.product_id,COALESCE(i.warehouse_id,r.warehouse_id),'PURCHASE_RETURN_REVERSAL',i.quantity_returned,i.unit_cost,v_balance,'purchase_return',r.id,p_reason,p_actor);
    UPDATE public.products SET stock = COALESCE(stock, 0) + i.quantity_returned WHERE id = i.product_id;
  END LOOP;
  UPDATE public.purchase_return_settlements SET status='reversed', reversed_by=p_actor, reversed_at=now()
    WHERE purchase_return_id=r.id AND status='posted';
  UPDATE public.purchase_returns SET status='reversed', reversed_by=p_actor, reversed_at=now(), reversal_reason=p_reason, updated_at=now()
    WHERE id=r.id RETURNING * INTO r;
  RETURN r;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_purchase_return(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reverse_purchase_return(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_purchase_return(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reverse_purchase_return(uuid,uuid,text) TO service_role;

-- Completed returns may never be hard-deleted; child financial records are restricted too.
CREATE OR REPLACE FUNCTION public.prevent_completed_purchase_return_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF OLD.status IN ('completed','reversed') THEN RAISE EXCEPTION 'Completed purchase returns cannot be deleted'; END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS prevent_completed_purchase_return_delete ON public.purchase_returns;
CREATE TRIGGER prevent_completed_purchase_return_delete BEFORE DELETE ON public.purchase_returns
FOR EACH ROW EXECUTE FUNCTION public.prevent_completed_purchase_return_delete();

NOTIFY pgrst, 'reload schema';
