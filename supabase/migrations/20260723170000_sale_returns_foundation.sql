-- Sales Returns Foundation
--
-- Returns are recorded against the canonical, immutable sale_lines ledger
-- introduced by the historical-snapshot migration - never against the old
-- sales.items JSON blob, and never by mutating sale_lines itself. A return
-- line references the exact sale_line it came from, so refund math is
-- always derived from that immutable point-of-sale snapshot (unit_price,
-- discount, tax) rather than today's catalogue. Like create_sale_atomic,
-- creation is a single SECURITY DEFINER RPC restricted to the trusted
-- application service, and the resulting rows are immutable except through
-- the paired reversal function.

CREATE TABLE public.sale_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  return_number text NOT NULL UNIQUE,
  sale_id uuid NOT NULL REFERENCES public.sales(id),
  customer_id uuid,
  branch_id uuid,
  warehouse_id uuid,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'reversed')),
  subtotal numeric(14,2) NOT NULL CHECK (subtotal >= 0),
  refund_amount numeric(14,2) NOT NULL CHECK (refund_amount >= 0),
  refund_method text NOT NULL CHECK (refund_method IN ('cash', 'card', 'mobile_money', 'store_credit', 'bank_transfer')),
  reason text,
  notes text,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  reversed_by uuid REFERENCES auth.users(id),
  reversed_at timestamptz,
  reversal_reason text,
  returned_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sale_returns_sale_id_idx ON public.sale_returns(sale_id);
CREATE INDEX sale_returns_user_id_idx ON public.sale_returns(user_id, returned_at DESC);
COMMENT ON TABLE public.sale_returns IS
  'Customer returns against canonical sale_lines. Created only via create_sale_return_atomic.';

CREATE TABLE public.sale_return_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_return_id uuid NOT NULL REFERENCES public.sale_returns(id) ON DELETE CASCADE,
  sale_line_id uuid NOT NULL REFERENCES public.sale_lines(id),
  product_id uuid,
  product_name text,
  sku text,
  quantity_returned numeric(14,3) NOT NULL CHECK (quantity_returned > 0),
  unit_price numeric(14,2) NOT NULL CHECK (unit_price >= 0),
  refund_amount numeric(14,2) NOT NULL CHECK (refund_amount >= 0),
  reason text,
  item_condition text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sale_return_lines_return_idx ON public.sale_return_lines(sale_return_id);
CREATE INDEX sale_return_lines_sale_line_idx ON public.sale_return_lines(sale_line_id);
COMMENT ON TABLE public.sale_return_lines IS
  'One row per returned quantity against a specific immutable sale_lines row.';

CREATE SEQUENCE IF NOT EXISTS public.sale_return_number_seq;
CREATE OR REPLACE FUNCTION public.next_sale_return_number()
RETURNS text LANGUAGE sql VOLATILE SET search_path = public AS $$
  SELECT 'SR-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('public.sale_return_number_seq')::text, 6, '0')
$$;

ALTER TABLE public.sale_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_return_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view visible sale returns" ON public.sale_returns FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "view visible sale return lines" ON public.sale_return_lines FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sale_returns r
    WHERE r.id = sale_return_lines.sale_return_id
      AND (r.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
  ));
GRANT SELECT ON public.sale_returns, public.sale_return_lines TO authenticated;
GRANT ALL ON public.sale_returns, public.sale_return_lines TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.sale_returns FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.sale_return_lines FROM authenticated;

CREATE OR REPLACE FUNCTION public.prevent_sale_return_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_setting('app.sale_return_write_id', true) = OLD.id::text THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Sales returns are immutable; they cannot be deleted'; END IF;
  RAISE EXCEPTION 'Sales returns are immutable; only reversal may change their status';
END;
$$;

CREATE OR REPLACE FUNCTION public.require_canonical_sale_return_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_setting('app.sale_return_insert', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Sales returns must be created through create_sale_return_atomic';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_sale_return_line_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Canonical sale return lines are immutable';
END;
$$;

CREATE OR REPLACE FUNCTION public.require_canonical_sale_return_line_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_setting('app.sale_return_line_insert_id', true) IS DISTINCT FROM NEW.sale_return_id::text THEN
    RAISE EXCEPTION 'Sale return lines may only be inserted by a canonical return function';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sale_returns_history_immutable
  BEFORE UPDATE OR DELETE ON public.sale_returns
  FOR EACH ROW EXECUTE FUNCTION public.prevent_sale_return_mutation();
CREATE TRIGGER sale_returns_require_canonical_insert
  BEFORE INSERT ON public.sale_returns
  FOR EACH ROW EXECUTE FUNCTION public.require_canonical_sale_return_insert();
CREATE TRIGGER sale_return_lines_immutable
  BEFORE UPDATE OR DELETE ON public.sale_return_lines
  FOR EACH ROW EXECUTE FUNCTION public.prevent_sale_return_line_mutation();
CREATE TRIGGER sale_return_lines_require_canonical_insert
  BEFORE INSERT ON public.sale_return_lines
  FOR EACH ROW EXECUTE FUNCTION public.require_canonical_sale_return_line_insert();

-- The single creation path. Every line is validated against the exact
-- sale_lines row it came from (quantity already returned, price, tax),
-- restocked, and refunded. Nothing here ever touches sale_lines itself.
CREATE FUNCTION public.create_sale_return_atomic(
  p_actor uuid, p_sale_id uuid, p_lines jsonb, p_refund_method text,
  p_reason text DEFAULT NULL, p_notes text DEFAULT NULL
)
RETURNS public.sale_returns
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sale public.sales%ROWTYPE;
  v_return public.sale_returns%ROWTYPE;
  v_return_id uuid := gen_random_uuid();
  v_line jsonb;
  v_sale_line public.sale_lines%ROWTYPE;
  v_sale_line_id uuid;
  v_quantity numeric;
  v_already_returned numeric;
  v_returnable numeric;
  v_unit_refund numeric;
  v_line_refund numeric;
  v_subtotal numeric := 0;
  v_stock_before numeric;
  v_balance_after numeric;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'create_sale_return_atomic is restricted to the trusted application service';
  END IF;
  IF p_actor IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_actor) THEN
    RAISE EXCEPTION 'A valid actor is required';
  END IF;
  IF p_refund_method NOT IN ('cash', 'card', 'mobile_money', 'store_credit', 'bank_transfer') THEN
    RAISE EXCEPTION 'Invalid refund method';
  END IF;
  IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'At least one returned line is required';
  END IF;

  SELECT * INTO v_sale FROM public.sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sale not found'; END IF;
  IF v_sale.status <> 'completed' THEN
    RAISE EXCEPTION 'Only a completed sale can be returned against';
  END IF;
  IF v_sale.return_eligible IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'This sale is not eligible for returns';
  END IF;

  PERFORM set_config('app.sale_return_insert', 'on', true);
  INSERT INTO public.sale_returns (
    id, user_id, return_number, sale_id, customer_id, branch_id, warehouse_id,
    status, subtotal, refund_amount, refund_method, reason, notes, created_by
  ) VALUES (
    v_return_id, v_sale.user_id, public.next_sale_return_number(), p_sale_id,
    v_sale.customer_id, v_sale.branch_id, v_sale.warehouse_id,
    'completed', 0, 0, p_refund_method, p_reason, p_notes, p_actor
  ) RETURNING * INTO v_return;

  PERFORM set_config('app.sale_return_line_insert_id', v_return_id::text, true);

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    v_sale_line_id := NULLIF(v_line->>'saleLineId', '')::uuid;
    v_quantity := COALESCE((v_line->>'quantityReturned')::numeric, 0);
    IF v_sale_line_id IS NULL OR v_quantity <= 0 THEN
      RAISE EXCEPTION 'Each returned line requires a valid sale line and a positive quantity';
    END IF;

    SELECT * INTO v_sale_line
    FROM public.sale_lines WHERE id = v_sale_line_id AND sale_id = p_sale_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Sale line % does not belong to this sale', v_sale_line_id;
    END IF;
    IF v_sale_line.quantity IS NULL OR v_sale_line.unit_price IS NULL
       OR v_sale_line.total_amount IS NULL THEN
      RAISE EXCEPTION 'Sale line % has no complete pricing snapshot and cannot be returned',
        v_sale_line_id;
    END IF;

    SELECT COALESCE(sum(rl.quantity_returned), 0) INTO v_already_returned
    FROM public.sale_return_lines rl
    JOIN public.sale_returns r ON r.id = rl.sale_return_id
    WHERE rl.sale_line_id = v_sale_line_id AND r.status = 'completed';
    v_returnable := v_sale_line.quantity - v_already_returned;
    IF v_quantity > v_returnable THEN
      RAISE EXCEPTION 'Return quantity for % cannot exceed % units', v_sale_line.product_name, v_returnable;
    END IF;

    -- Refund per unit is the line's net effective price (post discount/tax),
    -- not just unit_price, so the refund always matches what was charged.
    v_unit_refund := round(v_sale_line.total_amount / v_sale_line.quantity, 2);
    v_line_refund := round(v_unit_refund * v_quantity, 2);
    v_subtotal := v_subtotal + v_line_refund;

    INSERT INTO public.sale_return_lines (
      id, sale_return_id, sale_line_id, product_id, product_name, sku,
      quantity_returned, unit_price, refund_amount, reason, item_condition
    ) VALUES (
      gen_random_uuid(), v_return_id, v_sale_line_id, v_sale_line.product_id,
      v_sale_line.product_name, v_sale_line.sku, v_quantity, v_sale_line.unit_price,
      v_line_refund, NULLIF(v_line->>'reason', ''), NULLIF(v_line->>'condition', '')
    );

    IF v_sale_line.product_id IS NOT NULL THEN
      SELECT stock INTO v_stock_before FROM public.products WHERE id = v_sale_line.product_id FOR UPDATE;
      IF FOUND THEN
        v_balance_after := COALESCE(v_stock_before, 0) + v_quantity;
        UPDATE public.products SET stock = v_balance_after WHERE id = v_sale_line.product_id;
        INSERT INTO public.stock_movements (
          user_id, product_id, warehouse_id, movement_type, quantity, unit_cost,
          balance_after, reference_type, reference_id, reason, created_by
        ) VALUES (
          v_sale.user_id, v_sale_line.product_id, v_sale_line.warehouse_id, 'sale_return',
          v_quantity, v_sale_line.unit_cost, v_balance_after, 'sale_return', v_return_id,
          COALESCE(p_reason, 'Sales return'), p_actor
        );
      END IF;
    END IF;
  END LOOP;

  PERFORM set_config('app.sale_return_write_id', v_return_id::text, true);
  UPDATE public.sale_returns SET subtotal = v_subtotal, refund_amount = v_subtotal, updated_at = now()
  WHERE id = v_return_id RETURNING * INTO v_return;

  IF v_sale.customer_id IS NOT NULL THEN
    INSERT INTO public.customer_credits(user_id, customer_id, type, amount, reference, notes)
    VALUES (v_sale.user_id, v_sale.customer_id, 'refund', v_subtotal, v_return.return_number,
      'Refund for return ' || v_return.return_number);
    UPDATE public.customers SET total_spend = GREATEST(COALESCE(total_spend, 0) - v_subtotal, 0)
    WHERE uuid_id = v_sale.customer_id;
  END IF;

  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, entity_name, details)
  VALUES (p_actor, 'create', 'sale_return', v_return_id::text, v_return.return_number,
    jsonb_build_object('saleId', p_sale_id, 'refundAmount', v_subtotal, 'refundMethod', p_refund_method));

  RETURN v_return;
END;
$$;

REVOKE ALL ON FUNCTION public.create_sale_return_atomic(uuid, uuid, jsonb, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_sale_return_atomic(uuid, uuid, jsonb, text, text, text) TO service_role;

-- The only other write path. Admin-only correction of a mistaken return:
-- destocks what was restocked and reverses the refund's effect on the
-- customer's recorded spend, then marks the return reversed.
CREATE FUNCTION public.reverse_sale_return(p_return_id uuid, p_actor uuid, p_reason text)
RETURNS public.sale_returns
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_return public.sale_returns%ROWTYPE;
  v_sale public.sales%ROWTYPE;
  v_line public.sale_return_lines%ROWTYPE;
  v_stock_before numeric;
  v_balance_after numeric;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'reverse_sale_return is restricted to the trusted application service';
  END IF;
  IF length(trim(COALESCE(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'A reversal reason is required';
  END IF;

  SELECT * INTO v_return FROM public.sale_returns WHERE id = p_return_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sale return not found'; END IF;
  IF v_return.status = 'reversed' THEN RAISE EXCEPTION 'This return has already been reversed'; END IF;

  SELECT * INTO v_sale FROM public.sales WHERE id = v_return.sale_id;

  FOR v_line IN SELECT * FROM public.sale_return_lines WHERE sale_return_id = p_return_id
  LOOP
    IF v_line.product_id IS NOT NULL THEN
      SELECT stock INTO v_stock_before FROM public.products WHERE id = v_line.product_id FOR UPDATE;
      IF FOUND THEN
        v_balance_after := GREATEST(COALESCE(v_stock_before, 0) - v_line.quantity_returned, 0);
        UPDATE public.products SET stock = v_balance_after WHERE id = v_line.product_id;
        INSERT INTO public.stock_movements (
          user_id, product_id, warehouse_id, movement_type, quantity, unit_cost,
          balance_after, reference_type, reference_id, reason, created_by
        ) VALUES (
          v_return.user_id, v_line.product_id, v_return.warehouse_id, 'sale_return_reversal',
          -v_line.quantity_returned, v_line.unit_price, v_balance_after, 'sale_return', p_return_id,
          p_reason, p_actor
        );
      END IF;
    END IF;
  END LOOP;

  IF v_return.customer_id IS NOT NULL THEN
    INSERT INTO public.customer_credits(user_id, customer_id, type, amount, reference, notes)
    VALUES (v_return.user_id, v_return.customer_id, 'charge', v_return.refund_amount,
      v_return.return_number, 'Reversal of return ' || v_return.return_number || ': ' || p_reason);
    UPDATE public.customers SET total_spend = COALESCE(total_spend, 0) + v_return.refund_amount
    WHERE uuid_id = v_return.customer_id;
  END IF;

  PERFORM set_config('app.sale_return_write_id', p_return_id::text, true);
  UPDATE public.sale_returns
  SET status = 'reversed', reversed_by = p_actor, reversed_at = now(),
      reversal_reason = p_reason, updated_at = now()
  WHERE id = p_return_id RETURNING * INTO v_return;

  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, entity_name, details)
  VALUES (p_actor, 'reverse', 'sale_return', p_return_id::text, v_return.return_number,
    jsonb_build_object('reason', p_reason, 'refundAmount', v_return.refund_amount));

  RETURN v_return;
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_sale_return(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_sale_return(uuid, uuid, text) TO service_role;

NOTIFY pgrst, 'reload schema';
