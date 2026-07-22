-- Sales Engine Foundation - Historical Sale Snapshot
--
-- The header remains compatible with existing readers of sales.items, while
-- sale_lines becomes the canonical, immutable record. Legacy rows are copied
-- without consulting today's catalogue: unknown history is marked partial,
-- retained in source_payload, and deliberately made ineligible for returns.

ALTER TABLE public.sales
  ADD COLUMN idempotency_key uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN snapshot_version smallint NOT NULL DEFAULT 1,
  ADD COLUMN source_system text NOT NULL DEFAULT 'application',
  ADD COLUMN effects_mode text NOT NULL DEFAULT 'post',
  ADD COLUMN snapshot_completeness text NOT NULL DEFAULT 'complete',
  ADD COLUMN return_eligible boolean NOT NULL DEFAULT true,
  ADD COLUMN currency text NOT NULL DEFAULT 'GHS',
  ADD COLUMN effects_posted_at timestamptz,
  ADD COLUMN engine_created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.sales
  ADD CONSTRAINT sales_idempotency_key_key UNIQUE (idempotency_key),
  ADD CONSTRAINT sales_snapshot_version_check CHECK (snapshot_version = 1),
  ADD CONSTRAINT sales_source_system_check
    CHECK (source_system IN ('application', 'historical_import', 'smoke_test', 'legacy')),
  ADD CONSTRAINT sales_effects_mode_check
    CHECK (effects_mode IN ('post', 'historical_no_post')),
  ADD CONSTRAINT sales_snapshot_completeness_check
    CHECK (snapshot_completeness IN ('complete', 'catalog_at_import', 'legacy_partial')),
  ADD CONSTRAINT sales_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT sales_amounts_nonnegative_check CHECK (
    subtotal >= 0 AND tax >= 0 AND discount >= 0 AND total >= 0
    AND paid >= 0 AND change_due >= 0
  );

CREATE TABLE public.sale_lines (
  id uuid PRIMARY KEY,
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  line_number integer NOT NULL CHECK (line_number > 0),
  product_id uuid,
  branch_id uuid,
  warehouse_id uuid,
  sold_at timestamptz NOT NULL,
  product_name text,
  sku text,
  barcode text,
  category_id uuid,
  category_name text,
  brand text,
  unit text,
  quantity numeric(14,3) CHECK (quantity IS NULL OR quantity > 0),
  unit_price numeric(14,2) CHECK (unit_price IS NULL OR unit_price >= 0),
  unit_cost numeric(14,2) CHECK (unit_cost IS NULL OR unit_cost >= 0),
  tax_rate numeric(8,4) CHECK (tax_rate IS NULL OR tax_rate >= 0),
  gross_amount numeric(14,2) CHECK (gross_amount IS NULL OR gross_amount >= 0),
  discount_amount numeric(14,2) CHECK (discount_amount IS NULL OR discount_amount >= 0),
  tax_amount numeric(14,2) CHECK (tax_amount IS NULL OR tax_amount >= 0),
  total_amount numeric(14,2) CHECK (total_amount IS NULL OR total_amount >= 0),
  cogs_amount numeric(14,2) CHECK (cogs_amount IS NULL OR cogs_amount >= 0),
  batch_number text,
  expiry_date date,
  serial_numbers jsonb CHECK (serial_numbers IS NULL OR jsonb_typeof(serial_numbers) = 'array'),
  promotion_snapshot jsonb CHECK (
    promotion_snapshot IS NULL OR jsonb_typeof(promotion_snapshot) = 'object'
  ),
  pricing_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(pricing_snapshot) = 'object'),
  product_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(product_snapshot) = 'object'),
  source_payload jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(source_payload) = 'object'),
  known_fields jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(known_fields) = 'object'),
  snapshot_completeness text NOT NULL
    CHECK (snapshot_completeness IN ('complete', 'catalog_at_import', 'legacy_partial')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sale_lines_sale_line_number_key UNIQUE (sale_id, line_number),
  CONSTRAINT sale_lines_complete_snapshot_check CHECK (
    snapshot_completeness = 'legacy_partial'
    OR (
      product_id IS NOT NULL AND product_name IS NOT NULL AND quantity IS NOT NULL
      AND unit_price IS NOT NULL AND unit_cost IS NOT NULL AND tax_rate IS NOT NULL
      AND gross_amount IS NOT NULL AND discount_amount IS NOT NULL AND tax_amount IS NOT NULL
      AND total_amount IS NOT NULL AND cogs_amount IS NOT NULL AND serial_numbers IS NOT NULL
    )
  ),
  CONSTRAINT sale_lines_gross_check CHECK (
    snapshot_completeness = 'legacy_partial' OR gross_amount = round(quantity * unit_price, 2)
  ),
  CONSTRAINT sale_lines_total_check
    CHECK (
      snapshot_completeness = 'legacy_partial'
      OR total_amount = gross_amount - discount_amount + tax_amount
    ),
  CONSTRAINT sale_lines_cogs_check CHECK (
    snapshot_completeness = 'legacy_partial' OR cogs_amount = round(quantity * unit_cost, 2)
  )
);

CREATE INDEX sale_lines_sale_id_idx ON public.sale_lines(sale_id, line_number);
CREATE INDEX sale_lines_product_id_idx ON public.sale_lines(product_id);
COMMENT ON TABLE public.sale_lines IS
  'Canonical immutable sale lines. Values are point-in-time snapshots and never re-read from mutable catalogue data.';
COMMENT ON COLUMN public.sales.items IS
  'Immutable compatibility projection generated from sale_lines; sale_lines is authoritative.';

-- Preserve any pre-foundation sale exactly as received. Missing attributes are
-- not guessed from the current product row because doing so would falsify the
-- historical record.
CREATE FUNCTION public.try_sale_snapshot_numeric(p_value text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
BEGIN
  IF p_value IS NULL OR btrim(p_value) = '' THEN RETURN NULL; END IF;
  RETURN p_value::numeric;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RETURN NULL;
END;
$$;

WITH legacy AS (
  SELECT
    s.id AS sale_id,
    s.branch_id,
    s.warehouse_id,
    s.sold_at,
    item.value AS source_item,
    item.ordinality::integer AS line_number
  FROM public.sales s
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.items, '[]'::jsonb))
    WITH ORDINALITY AS item(value, ordinality)
), parsed AS (
  SELECT
    legacy.*,
    public.try_sale_snapshot_numeric(COALESCE(source_item->>'quantity', source_item->>'qty')) AS quantity_value,
    public.try_sale_snapshot_numeric(COALESCE(source_item->>'unitPrice', source_item->>'unit_price', source_item->>'price')) AS price_value,
    public.try_sale_snapshot_numeric(COALESCE(source_item->>'unitCost', source_item->>'unit_cost', source_item->>'cost')) AS cost_value,
    public.try_sale_snapshot_numeric(COALESCE(source_item->>'taxRate', source_item->>'tax_rate')) AS tax_rate_value,
    public.try_sale_snapshot_numeric(COALESCE(source_item->>'grossAmount', source_item->>'gross_amount', source_item->>'subtotal')) AS gross_value,
    public.try_sale_snapshot_numeric(COALESCE(source_item->>'discountAmount', source_item->>'discount_amount')) AS discount_value,
    public.try_sale_snapshot_numeric(COALESCE(source_item->>'taxAmount', source_item->>'tax_amount')) AS tax_value,
    public.try_sale_snapshot_numeric(COALESCE(source_item->>'total', source_item->>'line_total', source_item->>'totalAmount')) AS total_value,
    public.try_sale_snapshot_numeric(COALESCE(source_item->>'cogsAmount', source_item->>'cogs_amount')) AS cogs_value
  FROM legacy
)
INSERT INTO public.sale_lines (
  id, sale_id, line_number, product_id, branch_id, warehouse_id, sold_at,
  product_name, sku, category_name,
  quantity, unit_price, unit_cost, tax_rate, gross_amount, discount_amount,
  tax_amount, total_amount, cogs_amount, batch_number, expiry_date,
  serial_numbers, promotion_snapshot, pricing_snapshot, product_snapshot,
  source_payload, known_fields, snapshot_completeness
)
SELECT
  gen_random_uuid(),
  sale_id,
  line_number,
  CASE
    WHEN COALESCE(source_item->>'productId', source_item->>'product_id', '')
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    THEN COALESCE(source_item->>'productId', source_item->>'product_id')::uuid
    ELSE NULL
  END,
  branch_id,
  warehouse_id,
  sold_at,
  NULLIF(COALESCE(source_item->>'productName', source_item->>'product_name', source_item->>'name'), ''),
  source_item->>'sku',
  source_item->>'category',
  CASE WHEN quantity_value > 0 THEN quantity_value ELSE NULL END,
  CASE WHEN price_value >= 0 THEN price_value ELSE NULL END,
  CASE WHEN cost_value >= 0 THEN cost_value ELSE NULL END,
  CASE WHEN tax_rate_value >= 0 THEN tax_rate_value ELSE NULL END,
  CASE WHEN gross_value >= 0 THEN gross_value
    WHEN quantity_value > 0 AND price_value >= 0 THEN round(quantity_value * price_value, 2)
    ELSE NULL END,
  CASE WHEN discount_value >= 0 THEN discount_value ELSE NULL END,
  CASE WHEN tax_value >= 0 THEN tax_value ELSE NULL END,
  CASE WHEN total_value >= 0 THEN total_value ELSE NULL END,
  CASE WHEN cogs_value >= 0 THEN cogs_value
    WHEN quantity_value > 0 AND cost_value >= 0 THEN round(quantity_value * cost_value, 2)
    ELSE NULL END,
  COALESCE(source_item->>'batchNumber', source_item->>'batch_number'),
  CASE WHEN COALESCE(source_item->>'expiryDate', source_item->>'expiry_date', '') ~ '^\d{4}-\d{2}-\d{2}$'
    THEN COALESCE(source_item->>'expiryDate', source_item->>'expiry_date')::date ELSE NULL END,
  CASE WHEN jsonb_typeof(COALESCE(source_item->'serialNumbers', source_item->'serial_numbers')) = 'array'
    THEN COALESCE(source_item->'serialNumbers', source_item->'serial_numbers') ELSE NULL END,
  CASE WHEN jsonb_typeof(COALESCE(source_item->'promotionSnapshot', source_item->'promotion_snapshot')) = 'object'
    THEN COALESCE(source_item->'promotionSnapshot', source_item->'promotion_snapshot') ELSE NULL END,
  jsonb_build_object('source', 'legacy_payload'),
  source_item,
  source_item,
  jsonb_build_object(
    'productId', COALESCE(source_item->>'productId', source_item->>'product_id') IS NOT NULL,
    'productName', NULLIF(COALESCE(source_item->>'productName', source_item->>'product_name', source_item->>'name'), '') IS NOT NULL,
    'quantity', COALESCE(quantity_value > 0, false),
    'unitPrice', COALESCE(price_value >= 0, false),
    'unitCost', COALESCE(cost_value >= 0, false),
    'taxRate', COALESCE(tax_rate_value >= 0, false),
    'grossAmount', COALESCE(gross_value >= 0 OR (quantity_value > 0 AND price_value >= 0), false),
    'discountAmount', COALESCE(discount_value >= 0, false),
    'taxAmount', COALESCE(tax_value >= 0, false),
    'totalAmount', COALESCE(total_value >= 0, false),
    'cogsAmount', COALESCE(cogs_value >= 0 OR (quantity_value > 0 AND cost_value >= 0), false),
    'batchNumber', source_item ? 'batchNumber' OR source_item ? 'batch_number',
    'expiryDate', source_item ? 'expiryDate' OR source_item ? 'expiry_date',
    'serialNumbers', source_item ? 'serialNumbers' OR source_item ? 'serial_numbers',
    'promotionSnapshot', source_item ? 'promotionSnapshot' OR source_item ? 'promotion_snapshot',
    'branchId', branch_id IS NOT NULL,
    'warehouseId', warehouse_id IS NOT NULL,
    'soldAt', true
  ),
  'legacy_partial'
FROM parsed;

DROP FUNCTION public.try_sale_snapshot_numeric(text);

UPDATE public.sales
SET source_system = 'legacy',
    effects_mode = 'historical_no_post',
    snapshot_completeness = 'legacy_partial',
    return_eligible = false
WHERE created_at < statement_timestamp();

ALTER TABLE public.sale_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view visible sale lines" ON public.sale_lines FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sales s
    WHERE s.id = sale_lines.sale_id
      AND (s.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
  ));
GRANT SELECT ON public.sale_lines TO authenticated;
GRANT ALL ON public.sale_lines TO service_role;

CREATE OR REPLACE FUNCTION public.prevent_sale_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_setting('app.sale_engine_write_id', true) = OLD.id::text THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF current_setting('app.sale_smoke_cleanup', true) = 'on'
       AND OLD.source_system = 'smoke_test'
       AND OLD.effects_mode = 'historical_no_post' THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'Sale history is immutable; sales cannot be deleted';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['notes', 'updated_at'])
      IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['notes', 'updated_at']) THEN
    RAISE EXCEPTION 'Sale history is immutable; only notes may be updated';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.require_canonical_sale_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_setting('app.sale_engine_insert', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Sales must be created through create_sale_atomic';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_sale_line_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_setting('app.sale_smoke_cleanup', true) = 'on' THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Canonical sale lines are immutable';
END;
$$;

CREATE OR REPLACE FUNCTION public.require_canonical_sale_line_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_setting('app.sale_line_insert_sale_id', true) IS DISTINCT FROM NEW.sale_id::text
     OR COALESCE(current_setting('app.sale_line_insert_mode', true), '') NOT IN ('engine', 'restore') THEN
    RAISE EXCEPTION 'Sale lines may only be inserted by a canonical sales function';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sales_history_immutable
  BEFORE UPDATE OR DELETE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.prevent_sale_history_mutation();
CREATE TRIGGER sales_require_canonical_insert
  BEFORE INSERT ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.require_canonical_sale_insert();
CREATE TRIGGER sale_lines_history_immutable
  BEFORE UPDATE OR DELETE ON public.sale_lines
  FOR EACH ROW EXECUTE FUNCTION public.prevent_sale_line_mutation();
CREATE TRIGGER sale_lines_require_canonical_insert
  BEFORE INSERT ON public.sale_lines
  FOR EACH ROW EXECUTE FUNCTION public.require_canonical_sale_line_insert();

REVOKE INSERT, UPDATE, DELETE ON public.sales FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.sale_lines FROM authenticated;

DROP FUNCTION IF EXISTS public.create_sale_atomic(uuid, jsonb, numeric);

CREATE FUNCTION public.create_sale_atomic(p_actor uuid, p_sale jsonb, p_lines jsonb)
RETURNS public.sales
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sale public.sales%ROWTYPE;
  v_existing public.sales%ROWTYPE;
  v_product record;
  v_line jsonb;
  v_line_number integer;
  v_line_id uuid;
  v_product_id uuid;
  v_branch_id uuid;
  v_warehouse_id uuid;
  v_default_warehouse_id uuid;
  v_quantity numeric;
  v_unit_price numeric;
  v_unit_cost numeric;
  v_gross numeric;
  v_discount numeric;
  v_tax numeric;
  v_line_total numeric;
  v_cogs numeric;
  v_subtotal numeric := 0;
  v_discount_total numeric := 0;
  v_tax_total numeric := 0;
  v_total numeric := 0;
  v_items jsonb := '[]'::jsonb;
  v_source text := COALESCE(p_sale->>'source_system', 'application');
  v_effects text := COALESCE(p_sale->>'effects_mode', 'post');
  v_completeness text := COALESCE(p_sale->>'snapshot_completeness', 'complete');
  v_status text := COALESCE(p_sale->>'status', 'completed');
  v_idempotency_key uuid;
  v_product_stock numeric;
  v_product_warehouse_id uuid;
  v_movement_balance numeric;
  v_movement_count integer;
  v_available numeric;
  v_balance_after numeric;
  v_credit numeric;
  v_sold_at timestamptz;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'create_sale_atomic is restricted to the trusted application service';
  END IF;
  IF p_actor IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_actor) THEN
    RAISE EXCEPTION 'A valid sale actor is required';
  END IF;
  IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'At least one canonical sale line is required';
  END IF;
  IF v_source NOT IN ('application', 'historical_import', 'smoke_test')
     OR v_effects NOT IN ('post', 'historical_no_post')
     OR v_completeness NOT IN ('complete', 'catalog_at_import') THEN
    RAISE EXCEPTION 'Invalid sale provenance';
  END IF;
  IF v_effects = 'post' AND v_completeness <> 'complete' THEN
    RAISE EXCEPTION 'Posted sales require complete snapshots';
  END IF;

  IF NULLIF(p_sale->>'idempotency_key', '') IS NULL THEN
    RAISE EXCEPTION 'A logical transaction idempotency key is required';
  END IF;
  v_idempotency_key := (p_sale->>'idempotency_key')::uuid;
  -- Serialize concurrent retries before the existence check. Without this,
  -- the unique index prevents duplication but one caller can still receive a
  -- constraint error instead of the already-created transaction.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_idempotency_key::text, 0));
  SELECT * INTO v_existing FROM public.sales WHERE idempotency_key = v_idempotency_key;
  IF FOUND THEN
    IF v_existing.user_id <> p_actor THEN
      RAISE EXCEPTION 'Idempotency key belongs to another actor';
    END IF;
    RETURN v_existing;
  END IF;

  SELECT uuid_id INTO v_default_warehouse_id
  FROM public.warehouses WHERE is_default = true AND is_active = true
  ORDER BY id LIMIT 1;
  v_warehouse_id := COALESCE(NULLIF(p_sale->>'warehouse_id', '')::uuid, v_default_warehouse_id);
  IF v_effects = 'post' AND v_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'No active default warehouse is configured';
  END IF;
  v_branch_id := NULLIF(p_sale->>'branch_id', '')::uuid;
  IF v_branch_id IS NULL AND v_warehouse_id IS NOT NULL THEN
    SELECT b.uuid_id INTO v_branch_id
    FROM public.warehouses w
    LEFT JOIN public.branches b ON b.id = w.branch_id
    WHERE w.uuid_id = v_warehouse_id;
  END IF;
  v_sold_at := COALESCE((p_sale->>'sold_at')::timestamptz, now());

  PERFORM set_config('app.sale_engine_insert', 'on', true);
  INSERT INTO public.sales (
    user_id, idempotency_key, reference, customer_id, branch_id, warehouse_id,
    cash_session_id, channel, status, payment_status, payment_method,
    subtotal, tax, discount, total, paid, change_due, items, notes, sold_at,
    snapshot_version, source_system, effects_mode, snapshot_completeness,
    return_eligible, currency
  ) VALUES (
    p_actor, v_idempotency_key, p_sale->>'reference',
    NULLIF(p_sale->>'customer_id', '')::uuid,
    v_branch_id, v_warehouse_id,
    NULLIF(p_sale->>'cash_session_id', '')::uuid,
    COALESCE(p_sale->>'channel', 'pos'), v_status,
    COALESCE(p_sale->>'payment_status', 'paid'), p_sale->>'payment_method',
    0, 0, 0, 0, GREATEST(COALESCE((p_sale->>'paid')::numeric, 0), 0),
    GREATEST(COALESCE((p_sale->>'change_due')::numeric, 0), 0), '[]'::jsonb,
    p_sale->>'notes', v_sold_at,
    1, v_source, v_effects, v_completeness,
    (v_effects = 'post' AND v_completeness = 'complete' AND v_status = 'completed'),
    upper(COALESCE(NULLIF(p_sale->>'currency', ''), 'GHS'))
  ) RETURNING * INTO v_sale;

  PERFORM set_config('app.sale_line_insert_sale_id', v_sale.id::text, true);
  PERFORM set_config('app.sale_line_insert_mode', 'engine', true);

  FOR v_line, v_line_number IN
    SELECT value, ordinality::integer FROM jsonb_array_elements(p_lines) WITH ORDINALITY
  LOOP
    v_product_id := NULLIF(COALESCE(v_line->>'productId', v_line->>'product_id'), '')::uuid;
    v_quantity := COALESCE((v_line->>'quantity')::numeric, 0);
    v_unit_price := round(COALESCE((v_line->>'unitPrice')::numeric, 0), 2);
    v_discount := round(COALESCE((v_line->>'discountAmount')::numeric, 0), 2);
    v_tax := round(COALESCE((v_line->>'taxAmount')::numeric, 0), 2);
    v_line_id := COALESCE(NULLIF(v_line->>'lineId', '')::uuid, gen_random_uuid());
    IF v_product_id IS NULL OR v_quantity <= 0 OR v_unit_price < 0 OR v_discount < 0 OR v_tax < 0 THEN
      RAISE EXCEPTION 'Invalid canonical sale line %', v_line_number;
    END IF;

    SELECT p.id, p.name, p.sku, p.barcode, p.category_id, pc.name AS category_name,
           p.brand, p.unit, p.cost, p.tax_rate, p.stock, p.warehouse_id,
           p.batch_lot_number, p.expiry_date, p.attributes, p.price
    INTO v_product
    FROM public.products p
    LEFT JOIN public.product_categories pc ON pc.id = p.category_id
    WHERE p.id = v_product_id
    FOR UPDATE OF p;
    IF NOT FOUND THEN RAISE EXCEPTION 'Product % not found', v_product_id; END IF;
    IF v_product.cost IS NULL OR v_product.cost < 0 THEN
      RAISE EXCEPTION 'Product % has no valid historical unit cost to snapshot', v_product_id;
    END IF;
    IF v_product.tax_rate IS NULL OR v_product.tax_rate < 0 THEN
      RAISE EXCEPTION 'Product % has no valid tax rate to snapshot', v_product_id;
    END IF;

    v_unit_cost := round(v_product.cost, 2);
    v_gross := round(v_quantity * v_unit_price, 2);
    v_line_total := v_gross - v_discount + v_tax;
    v_cogs := round(v_quantity * v_unit_cost, 2);
    IF v_line_total < 0 THEN RAISE EXCEPTION 'Sale line % total cannot be negative', v_line_number; END IF;

    INSERT INTO public.sale_lines (
      id, sale_id, line_number, product_id, branch_id, warehouse_id, sold_at,
      product_name, sku,
      barcode, category_id, category_name, brand, unit, quantity, unit_price,
      unit_cost, tax_rate, gross_amount, discount_amount, tax_amount, total_amount,
      cogs_amount, batch_number, expiry_date, serial_numbers, promotion_snapshot,
      pricing_snapshot, product_snapshot, source_payload, known_fields,
      snapshot_completeness
    ) VALUES (
      v_line_id, v_sale.id, v_line_number, v_product_id, v_branch_id, v_warehouse_id,
      v_sold_at,
      v_product.name, v_product.sku, v_product.barcode, v_product.category_id,
      v_product.category_name, v_product.brand, v_product.unit, v_quantity,
      v_unit_price, v_unit_cost, v_product.tax_rate, v_gross,
      v_discount, v_tax, v_line_total, v_cogs,
      COALESCE(NULLIF(v_line->>'batchNumber', ''), v_product.batch_lot_number),
      COALESCE(NULLIF(v_line->>'expiryDate', '')::date, v_product.expiry_date),
      CASE WHEN jsonb_typeof(v_line->'serialNumbers') = 'array'
        THEN v_line->'serialNumbers' ELSE '[]'::jsonb END,
      CASE WHEN jsonb_typeof(v_line->'promotionSnapshot') = 'object'
        THEN v_line->'promotionSnapshot' ELSE NULL END,
      CASE WHEN jsonb_typeof(v_line->'pricingSnapshot') = 'object'
        THEN v_line->'pricingSnapshot' ELSE '{}'::jsonb END,
      jsonb_build_object(
        'productId', v_product.id, 'name', v_product.name, 'sku', v_product.sku,
        'barcode', v_product.barcode, 'categoryId', v_product.category_id,
        'categoryName', v_product.category_name, 'brand', v_product.brand,
        'unit', v_product.unit, 'catalogPrice', v_product.price,
        'unitCost', v_unit_cost, 'taxRate', v_product.tax_rate,
        'batchNumber', v_product.batch_lot_number, 'expiryDate', v_product.expiry_date,
        'attributes', COALESCE(v_product.attributes, '{}'::jsonb)
      ),
      v_line,
      jsonb_build_object(
        'productId', true, 'productName', true, 'quantity', true,
        'unitPrice', true, 'unitCost', true, 'taxRate', true,
        'grossAmount', true, 'discountAmount', true, 'taxAmount', true,
        'totalAmount', true, 'cogsAmount', true, 'batchNumber', true,
        'expiryDate', true, 'serialNumbers', true, 'promotionSnapshot', true,
        'branchId', true, 'warehouseId', true, 'soldAt', true
      ),
      v_completeness
    );

    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'lineId', v_line_id, 'lineNumber', v_line_number,
      'productId', v_product_id, 'product_id', v_product_id,
      'name', v_product.name, 'productName', v_product.name,
      'sku', v_product.sku, 'category', v_product.category_name,
      'categoryId', v_product.category_id, 'quantity', v_quantity,
      'unitPrice', v_unit_price, 'price', v_unit_price, 'unitCost', v_unit_cost,
      'cost', v_unit_cost, 'grossAmount', v_gross,
      'discountAmount', v_discount, 'taxAmount', v_tax, 'total', v_line_total,
      'cogsAmount', v_cogs, 'warehouseId', v_warehouse_id,
      'branchId', v_branch_id, 'soldAt', v_sold_at,
      'batchNumber', COALESCE(NULLIF(v_line->>'batchNumber', ''), v_product.batch_lot_number),
      'expiryDate', COALESCE(NULLIF(v_line->>'expiryDate', '')::date, v_product.expiry_date),
      'serialNumbers', CASE WHEN jsonb_typeof(v_line->'serialNumbers') = 'array'
        THEN v_line->'serialNumbers' ELSE '[]'::jsonb END,
      'promotionSnapshot', v_line->'promotionSnapshot',
      'pricingSnapshot', COALESCE(v_line->'pricingSnapshot', '{}'::jsonb)
    ));
    v_subtotal := v_subtotal + v_gross;
    v_discount_total := v_discount_total + v_discount;
    v_tax_total := v_tax_total + v_tax;
    v_total := v_total + v_line_total;

    IF v_effects = 'post' AND v_status = 'completed' THEN
      v_product_stock := COALESCE(v_product.stock, 0);
      v_product_warehouse_id := v_product.warehouse_id;
      IF v_product_stock < v_quantity THEN
        RAISE EXCEPTION 'Insufficient company-wide stock for product %: total %, requested %',
          v_product_id, v_product_stock, v_quantity;
      END IF;
      IF v_warehouse_id = v_default_warehouse_id THEN
        SELECT COALESCE(sum(quantity), 0) INTO v_movement_balance
        FROM public.stock_movements
        WHERE product_id = v_product_id AND warehouse_id IS NOT NULL
          AND warehouse_id <> v_default_warehouse_id;
        v_available := v_product_stock - v_movement_balance;
      ELSE
        SELECT COALESCE(sum(quantity), 0), count(*) INTO v_movement_balance, v_movement_count
        FROM public.stock_movements
        WHERE product_id = v_product_id AND warehouse_id = v_warehouse_id;
        IF v_movement_count = 0 THEN
          v_movement_balance := CASE WHEN v_product_warehouse_id IS NOT DISTINCT FROM v_warehouse_id
            THEN v_product_stock ELSE 0 END;
        END IF;
        v_available := v_movement_balance;
      END IF;
      IF v_available < v_quantity THEN
        RAISE EXCEPTION 'Insufficient warehouse stock for product %: available %, requested %',
          v_product_id, v_available, v_quantity;
      END IF;
      UPDATE public.products SET stock = v_product_stock - v_quantity WHERE id = v_product_id;
      SELECT COALESCE(sum(quantity), 0) INTO v_movement_balance
      FROM public.stock_movements WHERE product_id = v_product_id AND warehouse_id = v_warehouse_id;
      v_balance_after := v_movement_balance - v_quantity;
      INSERT INTO public.stock_movements (
        user_id, product_id, warehouse_id, movement_type, quantity, unit_cost,
        balance_after, reference_type, reference_id, reason, created_by
      ) VALUES (
        p_actor, v_product_id, v_warehouse_id, 'sale', -v_quantity, v_unit_cost,
        v_balance_after, 'sale', v_sale.id, 'Sale completed', p_actor
      );
    END IF;
  END LOOP;

  IF (p_sale ? 'subtotal' AND round((p_sale->>'subtotal')::numeric, 2) <> v_subtotal)
     OR (p_sale ? 'discount' AND round((p_sale->>'discount')::numeric, 2) <> v_discount_total)
     OR (p_sale ? 'tax' AND round((p_sale->>'tax')::numeric, 2) <> v_tax_total)
     OR (p_sale ? 'total' AND round((p_sale->>'total')::numeric, 2) <> v_total) THEN
    RAISE EXCEPTION 'Sale header totals do not match canonical line totals';
  END IF;

  PERFORM set_config('app.sale_engine_write_id', v_sale.id::text, true);
  UPDATE public.sales SET
    subtotal = v_subtotal, discount = v_discount_total, tax = v_tax_total,
    total = v_total, items = v_items,
    effects_posted_at = CASE WHEN v_effects = 'post' AND v_status = 'completed' THEN now() ELSE NULL END
  WHERE id = v_sale.id RETURNING * INTO v_sale;

  IF v_effects = 'post' AND v_status = 'completed' AND v_sale.customer_id IS NOT NULL THEN
    UPDATE public.customers SET total_spend = COALESCE(total_spend, 0) + v_total
    WHERE uuid_id = v_sale.customer_id;
    v_credit := CASE
      WHEN lower(COALESCE(v_sale.payment_method, '')) LIKE ANY (ARRAY['%credit%', '%account%'])
        THEN CASE WHEN v_sale.paid > 0 THEN GREATEST(v_total - v_sale.paid, 0) ELSE v_total END
      WHEN lower(COALESCE(v_sale.payment_status, '')) IN ('credit', 'unpaid', 'partial')
        THEN GREATEST(v_total - v_sale.paid, 0)
      ELSE 0 END;
    IF v_credit > 0 THEN
      INSERT INTO public.customer_credits(user_id, customer_id, type, amount, reference, notes)
      VALUES (p_actor, v_sale.customer_id, 'charge', v_credit,
        COALESCE(v_sale.reference, v_sale.id::text),
        'Sale ' || COALESCE(v_sale.reference, v_sale.id::text));
    END IF;
  END IF;

  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, entity_name, details)
  VALUES (p_actor, 'create', 'sale', v_sale.id::text, v_sale.reference,
    jsonb_build_object('engine', 'historical_snapshot_v1', 'sourceSystem', v_source,
      'effectsMode', v_effects, 'lineCount', jsonb_array_length(p_lines),
      'idempotencyKey', v_idempotency_key));
  RETURN v_sale;
END;
$$;

REVOKE ALL ON FUNCTION public.create_sale_atomic(uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_sale_atomic(uuid, jsonb, jsonb) TO service_role;

-- A canonical backup, read back through PostgREST/the JS client, represents
-- every SQL NULL JSONB column as a JSON `null` *value* on the key (the key is
-- still present), not as an absent key. The `->` operator then returns that
-- JSONB `null` unchanged, which is not a SQL NULL: it fails an `IS NULL`
-- check, and jsonb_typeof() reports it as 'null', not 'object'/'array' - so a
-- perfectly normal historical row (e.g. one with no promotion_snapshot) could
-- never be restored. COALESCE() does not fix this either, since a JSONB
-- `null` is not a SQL NULL and so is never replaced by COALESCE's fallback.
-- This helper is the single place that tells the three cases apart: the key
-- missing (SQL NULL), the key present with JSON null, and a genuine value -
-- and it rejects anything else instead of silently coercing it.
CREATE FUNCTION public.normalize_restored_jsonb(
  p_value jsonb, p_expected_type text, p_field_name text, p_default jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
BEGIN
  IF p_value IS NULL OR jsonb_typeof(p_value) = 'null' THEN
    RETURN p_default;
  END IF;
  IF jsonb_typeof(p_value) = p_expected_type THEN
    RETURN p_value;
  END IF;
  RAISE EXCEPTION 'Invalid backup shape for %: expected % or null, got %',
    p_field_name, p_expected_type, jsonb_typeof(p_value);
END;
$$;

-- The only non-creation insertion path. It restores exact immutable snapshots
-- and identities without replaying inventory, customer, receivable, or sale-
-- creation audit effects. Those ledgers are restored from their own backups.
CREATE FUNCTION public.restore_canonical_sale(p_actor uuid, p_sale jsonb, p_lines jsonb)
RETURNS public.sales
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sale public.sales%ROWTYPE;
  v_line jsonb;
  v_sale_id uuid;
  v_existing_line_count integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Canonical sale restore is restricted to the trusted application service';
  END IF;
  IF p_actor IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_actor) THEN
    RAISE EXCEPTION 'A valid restore actor is required';
  END IF;
  v_sale_id := NULLIF(p_sale->>'id', '')::uuid;
  IF v_sale_id IS NULL OR NULLIF(p_sale->>'idempotency_key', '') IS NULL THEN
    RAISE EXCEPTION 'Canonical sale identity and idempotency key are required';
  END IF;
  IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'Canonical restore requires sale lines';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_lines) line
    WHERE NULLIF(line->>'sale_id', '')::uuid IS DISTINCT FROM v_sale_id
       OR NULLIF(line->>'id', '') IS NULL
  ) THEN
    RAISE EXCEPTION 'Every restored line must retain its original sale and line identity';
  END IF;

  SELECT * INTO v_sale FROM public.sales WHERE id = v_sale_id;
  IF FOUND THEN
    IF v_sale.user_id <> p_actor
       OR v_sale.idempotency_key IS DISTINCT FROM (p_sale->>'idempotency_key')::uuid
       OR v_sale.items IS DISTINCT FROM COALESCE(p_sale->'items', '[]'::jsonb)
       OR v_sale.total IS DISTINCT FROM (p_sale->>'total')::numeric
       OR v_sale.sold_at IS DISTINCT FROM (p_sale->>'sold_at')::timestamptz THEN
      RAISE EXCEPTION 'Existing sale % conflicts with the canonical backup', v_sale_id;
    END IF;
    SELECT count(*) INTO v_existing_line_count FROM public.sale_lines WHERE sale_id = v_sale_id;
    IF v_existing_line_count <> jsonb_array_length(p_lines)
       OR EXISTS (
         SELECT 1 FROM jsonb_array_elements(p_lines) line
         WHERE NOT EXISTS (
           SELECT 1 FROM public.sale_lines existing
           WHERE existing.id = (line->>'id')::uuid AND existing.sale_id = v_sale_id
         )
       ) THEN
      RAISE EXCEPTION 'Existing canonical lines for sale % conflict with the backup', v_sale_id;
    END IF;
    RETURN v_sale;
  END IF;

  PERFORM set_config('app.sale_engine_insert', 'on', true);
  INSERT INTO public.sales (
    id, user_id, idempotency_key, reference, customer_id, branch_id, warehouse_id,
    cash_session_id, channel, status, payment_status, payment_method,
    subtotal, tax, discount, total, paid, change_due, items, notes, sold_at,
    created_at, updated_at, snapshot_version, source_system, effects_mode,
    snapshot_completeness, return_eligible, currency, effects_posted_at,
    engine_created_at
  ) VALUES (
    v_sale_id, p_actor, (p_sale->>'idempotency_key')::uuid, p_sale->>'reference',
    NULLIF(p_sale->>'customer_id', '')::uuid, NULLIF(p_sale->>'branch_id', '')::uuid,
    NULLIF(p_sale->>'warehouse_id', '')::uuid, NULLIF(p_sale->>'cash_session_id', '')::uuid,
    p_sale->>'channel', p_sale->>'status', p_sale->>'payment_status',
    p_sale->>'payment_method', (p_sale->>'subtotal')::numeric, (p_sale->>'tax')::numeric,
    (p_sale->>'discount')::numeric, (p_sale->>'total')::numeric,
    (p_sale->>'paid')::numeric, (p_sale->>'change_due')::numeric,
    public.normalize_restored_jsonb(p_sale->'items', 'array', 'sales.items', '[]'::jsonb),
    p_sale->>'notes',
    (p_sale->>'sold_at')::timestamptz, (p_sale->>'created_at')::timestamptz,
    (p_sale->>'updated_at')::timestamptz, (p_sale->>'snapshot_version')::smallint,
    p_sale->>'source_system', p_sale->>'effects_mode', p_sale->>'snapshot_completeness',
    (p_sale->>'return_eligible')::boolean, p_sale->>'currency',
    NULLIF(p_sale->>'effects_posted_at', '')::timestamptz,
    (p_sale->>'engine_created_at')::timestamptz
  ) RETURNING * INTO v_sale;

  PERFORM set_config('app.sale_line_insert_sale_id', v_sale_id::text, true);
  PERFORM set_config('app.sale_line_insert_mode', 'restore', true);
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    INSERT INTO public.sale_lines (
      id, sale_id, line_number, product_id, branch_id, warehouse_id, sold_at,
      product_name, sku, barcode, category_id, category_name, brand, unit,
      quantity, unit_price, unit_cost, tax_rate, gross_amount, discount_amount,
      tax_amount, total_amount, cogs_amount, batch_number, expiry_date,
      serial_numbers, promotion_snapshot, pricing_snapshot, product_snapshot,
      source_payload, known_fields, snapshot_completeness, created_at
    ) VALUES (
      (v_line->>'id')::uuid, v_sale_id, (v_line->>'line_number')::integer,
      NULLIF(v_line->>'product_id', '')::uuid, NULLIF(v_line->>'branch_id', '')::uuid,
      NULLIF(v_line->>'warehouse_id', '')::uuid, (v_line->>'sold_at')::timestamptz,
      v_line->>'product_name', v_line->>'sku', v_line->>'barcode',
      NULLIF(v_line->>'category_id', '')::uuid, v_line->>'category_name',
      v_line->>'brand', v_line->>'unit', NULLIF(v_line->>'quantity', '')::numeric,
      NULLIF(v_line->>'unit_price', '')::numeric, NULLIF(v_line->>'unit_cost', '')::numeric,
      NULLIF(v_line->>'tax_rate', '')::numeric, NULLIF(v_line->>'gross_amount', '')::numeric,
      NULLIF(v_line->>'discount_amount', '')::numeric, NULLIF(v_line->>'tax_amount', '')::numeric,
      NULLIF(v_line->>'total_amount', '')::numeric, NULLIF(v_line->>'cogs_amount', '')::numeric,
      v_line->>'batch_number', NULLIF(v_line->>'expiry_date', '')::date,
      public.normalize_restored_jsonb(v_line->'serial_numbers', 'array', 'sale_lines.serial_numbers', NULL),
      public.normalize_restored_jsonb(v_line->'promotion_snapshot', 'object', 'sale_lines.promotion_snapshot', NULL),
      public.normalize_restored_jsonb(v_line->'pricing_snapshot', 'object', 'sale_lines.pricing_snapshot', '{}'::jsonb),
      public.normalize_restored_jsonb(v_line->'product_snapshot', 'object', 'sale_lines.product_snapshot', '{}'::jsonb),
      public.normalize_restored_jsonb(v_line->'source_payload', 'object', 'sale_lines.source_payload', '{}'::jsonb),
      public.normalize_restored_jsonb(v_line->'known_fields', 'object', 'sale_lines.known_fields', '{}'::jsonb),
      v_line->>'snapshot_completeness', (v_line->>'created_at')::timestamptz
    );
  END LOOP;

  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, entity_name, details)
  VALUES (p_actor, 'restore', 'sale', v_sale.id::text, v_sale.reference,
    jsonb_build_object('engine', 'canonical_restore_v1', 'lineCount', jsonb_array_length(p_lines)));
  RETURN v_sale;
END;
$$;

REVOKE ALL ON FUNCTION public.restore_canonical_sale(uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restore_canonical_sale(uuid, jsonb, jsonb) TO service_role;

CREATE FUNCTION public.purge_smoke_test_sales(p_actor uuid, p_marker text DEFAULT NULL)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_removed bigint;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Smoke-test cleanup is restricted to the trusted application service';
  END IF;
  IF p_actor IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_actor) THEN
    RAISE EXCEPTION 'A valid actor is required';
  END IF;
  PERFORM set_config('app.sale_smoke_cleanup', 'on', true);
  DELETE FROM public.sales
  WHERE user_id = p_actor AND source_system = 'smoke_test'
    AND effects_mode = 'historical_no_post'
    AND (p_marker IS NULL OR notes = p_marker);
  GET DIAGNOSTICS v_removed = ROW_COUNT;
  RETURN v_removed;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_smoke_test_sales(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_smoke_test_sales(uuid, text) TO service_role;
