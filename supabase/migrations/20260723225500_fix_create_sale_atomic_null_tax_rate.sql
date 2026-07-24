-- create_sale_atomic was hard-blocking any sale containing a product with no
-- tax_rate set on its catalogue row, raising "has no valid tax rate to
-- snapshot". 455 of 480 live products (95%) have a NULL tax_rate, so this
-- was blocking sale creation for nearly the entire catalogue.
--
-- tax_rate is never used to calculate the tax actually charged on a line -
-- that comes from the line's own taxAmount, supplied by the caller. It is
-- only stored on sale_lines as a historical snapshot value, and sale_lines'
-- own CHECK constraint already requires tax_rate to be non-null for a
-- complete snapshot. So a missing catalogue tax_rate must become a real
-- value (0), not an error: it was never load-bearing for the sale's totals,
-- only for record-keeping, and untaxed is the correct assumption when no
-- rate is configured.

CREATE OR REPLACE FUNCTION public.create_sale_atomic(p_actor uuid, p_sale jsonb, p_lines jsonb)
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
  v_tax_rate numeric;
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
    IF v_product.tax_rate IS NOT NULL AND v_product.tax_rate < 0 THEN
      RAISE EXCEPTION 'Product % has an invalid negative tax rate', v_product_id;
    END IF;
    v_tax_rate := COALESCE(v_product.tax_rate, 0);

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
      v_unit_price, v_unit_cost, v_tax_rate, v_gross,
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
        'unitCost', v_unit_cost, 'taxRate', v_tax_rate,
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
