-- create_sale_atomic and post_stock_movement both hard-scoped every product/
-- warehouse/stock_movements/customer lookup to p_user (the calling staff
-- account), as if each account were an isolated tenant. But products,
-- warehouses, and customers are a shared business directory (per the
-- app-layer comments in products.ts/customers.ts/warehouses.ts) -- confirmed
-- live: a cashier account with zero warehouses of its own could not
-- complete any sale ("No central warehouse is configured for this
-- account"), and post_stock_movement's explicit
-- "Product does not belong to this user" check would have failed the same
-- way for purchase receiving / stock-take completion.
--
-- p_user/p_user_id is kept for attribution (sales.user_id, stock_movements
-- user_id/created_by, customer_credits.user_id) -- only the lookups/matches
-- against the shared directory are no longer filtered by it.

CREATE OR REPLACE FUNCTION public.create_sale_atomic(p_user_id uuid, p_sale jsonb, p_credit_amount numeric)
 RETURNS sales
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sale public.sales%ROWTYPE;
  v_item jsonb;
  v_product_id uuid;
  v_quantity numeric;
  v_cost numeric;
  v_warehouse_id uuid;
  v_effective_warehouse_id uuid;
  v_central_warehouse_id uuid;
  v_available numeric;
  v_movement_balance numeric;
  v_movement_count int;
  v_product_stock numeric;
  v_product_warehouse_id uuid;
  v_balance_after numeric;
  v_customer_id uuid;
  v_total numeric;
BEGIN
  INSERT INTO public.sales (
    user_id, reference, customer_id, branch_id, warehouse_id, cash_session_id,
    channel, status, payment_status, payment_method,
    subtotal, tax, discount, total, paid, change_due, items, notes, sold_at
  ) VALUES (
    p_user_id,
    p_sale->>'reference',
    NULLIF(p_sale->>'customer_id', '')::uuid,
    NULLIF(p_sale->>'branch_id', '')::uuid,
    NULLIF(p_sale->>'warehouse_id', '')::uuid,
    NULLIF(p_sale->>'cash_session_id', '')::uuid,
    COALESCE(p_sale->>'channel', 'pos'),
    COALESCE(p_sale->>'status', 'completed'),
    COALESCE(p_sale->>'payment_status', 'paid'),
    p_sale->>'payment_method',
    COALESCE((p_sale->>'subtotal')::numeric, 0),
    COALESCE((p_sale->>'tax')::numeric, 0),
    COALESCE((p_sale->>'discount')::numeric, 0),
    COALESCE((p_sale->>'total')::numeric, 0),
    COALESCE((p_sale->>'paid')::numeric, 0),
    COALESCE((p_sale->>'change_due')::numeric, 0),
    COALESCE(p_sale->'items', '[]'::jsonb),
    p_sale->>'notes',
    COALESCE((p_sale->>'sold_at')::timestamptz, now())
  ) RETURNING * INTO v_sale;

  v_warehouse_id := v_sale.warehouse_id;

  -- Sales Rule: no explicit warehouse -> Champion Mart (the shared
  -- is_default warehouse) is the effective one. Not scoped to p_user_id --
  -- warehouses are shared across the whole business, not per staff account.
  SELECT uuid_id INTO v_central_warehouse_id
  FROM public.warehouses
  WHERE is_default = true
  LIMIT 1;
  IF v_central_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'No central warehouse is configured (no warehouse is marked as default).';
  END IF;
  v_effective_warehouse_id := COALESCE(v_warehouse_id, v_central_warehouse_id);

  -- decrementProductStock(): only completed sales move stock.
  IF v_sale.status = 'completed' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_sale.items, '[]'::jsonb))
    LOOP
      v_product_id := NULLIF(COALESCE(v_item->>'productId', v_item->>'product_id'), '')::uuid;
      v_quantity := COALESCE((v_item->>'quantity')::numeric, (v_item->>'qty')::numeric, 0);
      IF v_product_id IS NULL OR v_quantity <= 0 THEN CONTINUE; END IF;
      v_cost := COALESCE((v_item->>'cost')::numeric, 0);

      -- Products are shared -- not scoped to p_user_id.
      SELECT stock, warehouse_id INTO v_product_stock, v_product_warehouse_id
      FROM public.products WHERE id = v_product_id FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Product % not found', v_product_id;
      END IF;

      -- Insufficient-stock guard, two independent checks:
      -- 1. Company-total: products.stock must itself cover the sale.
      -- 2. Effective-warehouse: the specific warehouse (central, derived; or
      --    a branch, a plain ledger sum) must also cover the sale.
      IF COALESCE(v_product_stock, 0) < v_quantity THEN
        RAISE EXCEPTION 'Insufficient company-wide stock for product %: total %, requested %',
          v_product_id, v_product_stock, v_quantity;
      END IF;

      -- Stock ledger spans every staff member's recorded movements, not
      -- just p_user_id's own -- otherwise a balance would silently
      -- undercount the moment more than one account posts movements.
      IF v_effective_warehouse_id = v_central_warehouse_id THEN
        SELECT COALESCE(sum(quantity), 0) INTO v_movement_balance
        FROM public.stock_movements
        WHERE product_id = v_product_id
          AND warehouse_id IS NOT NULL AND warehouse_id <> v_central_warehouse_id;
        v_available := COALESCE(v_product_stock, 0) - v_movement_balance;
      ELSE
        SELECT COALESCE(sum(quantity), 0), count(*) INTO v_movement_balance, v_movement_count
        FROM public.stock_movements
        WHERE product_id = v_product_id
          AND warehouse_id = v_effective_warehouse_id;
        IF v_movement_count = 0 THEN
          IF v_product_warehouse_id IS NOT DISTINCT FROM v_effective_warehouse_id THEN
            v_movement_balance := COALESCE(v_product_stock, 0);
          ELSE
            v_movement_balance := 0;
          END IF;
        END IF;
        v_available := v_movement_balance;
      END IF;

      IF v_available < v_quantity THEN
        RAISE EXCEPTION 'Insufficient stock for product %: available %, requested %',
          v_product_id, v_available, v_quantity;
      END IF;

      -- adjustProductStock(): plain subtraction, no floor. The guard above
      -- already guarantees this can't go negative.
      UPDATE public.products
      SET stock = COALESCE(v_product_stock, 0) - v_quantity
      WHERE id = v_product_id;

      -- recordStockMovement(): always recorded against the effective
      -- warehouse. user_id/created_by = p_user_id is attribution (who rang
      -- up this sale), not a scope filter.
      SELECT COALESCE(sum(quantity), 0) INTO v_movement_balance
      FROM public.stock_movements
      WHERE product_id = v_product_id AND warehouse_id = v_effective_warehouse_id;
      v_balance_after := v_movement_balance - v_quantity;
      INSERT INTO public.stock_movements(
        user_id, product_id, warehouse_id, movement_type, quantity, unit_cost,
        balance_after, reference_type, reference_id, reason, created_by
      ) VALUES (
        p_user_id, v_product_id, v_effective_warehouse_id, 'sale', -v_quantity, v_cost,
        v_balance_after, 'sale', v_sale.id, 'Sale completed', p_user_id
      );
    END LOOP;
  END IF;

  v_customer_id := v_sale.customer_id;
  v_total := COALESCE(v_sale.total, 0);

  -- updateCustomerSpend(): customers are shared -- match by uuid_id alone,
  -- not the sale-creator's user_id (which is almost never the customer's
  -- own creator).
  IF v_customer_id IS NOT NULL AND v_total > 0 AND v_sale.status = 'completed' THEN
    UPDATE public.customers
    SET total_spend = COALESCE(total_spend, 0) + v_total
    WHERE uuid_id = v_customer_id;
  END IF;

  -- recordCustomerReceivable(): status-independent, matching the original.
  IF v_customer_id IS NOT NULL AND p_credit_amount > 0 THEN
    INSERT INTO public.customer_credits(user_id, customer_id, type, amount, reference, notes)
    VALUES (
      p_user_id, v_customer_id, 'charge', p_credit_amount,
      COALESCE(v_sale.reference, v_sale.id::text),
      'Sale ' || COALESCE(v_sale.reference, v_sale.id::text)
    );
  END IF;

  RETURN v_sale;
END;
$function$;

CREATE OR REPLACE FUNCTION public.post_stock_movement(p_product uuid, p_qty numeric, p_type text, p_ref_type text, p_ref_id uuid, p_unit_cost numeric, p_reason text, p_user uuid, p_allow_negative boolean DEFAULT false)
 RETURNS stock_movements
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_product record;
  v_new_stock numeric;
  v_row public.stock_movements%ROWTYPE;
BEGIN
  IF p_product IS NULL THEN
    RAISE EXCEPTION 'Product is required';
  END IF;
  IF p_user IS NULL THEN
    RAISE EXCEPTION 'User is required';
  END IF;
  IF p_qty IS NULL OR p_qty = 0 THEN
    RAISE EXCEPTION 'Stock movement quantity must not be zero';
  END IF;

  -- Products are a shared business directory -- the "belongs to this user"
  -- check below was removed; it rejected every non-admin account, since
  -- products are created under one account but usable by any staff member.
  SELECT id, user_id, warehouse_id, stock, cost, name
  INTO v_product
  FROM public.products
  WHERE id = p_product
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found for stock movement %', p_product;
  END IF;

  v_new_stock := COALESCE(v_product.stock, 0) + p_qty;
  IF v_new_stock < 0 AND NOT p_allow_negative THEN
    RAISE EXCEPTION '% does not have enough stock', COALESCE(v_product.name, 'Product');
  END IF;

  UPDATE public.products
  SET stock = v_new_stock,
      updated_at = now()
  WHERE id = p_product;

  INSERT INTO public.stock_movements (
    user_id,
    product_id,
    warehouse_id,
    movement_type,
    quantity,
    unit_cost,
    balance_after,
    reference_type,
    reference_id,
    reason,
    created_by
  )
  VALUES (
    p_user,
    p_product,
    v_product.warehouse_id,
    p_type,
    p_qty,
    COALESCE(p_unit_cost, v_product.cost, 0),
    v_new_stock,
    p_ref_type,
    p_ref_id,
    p_reason,
    p_user
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;
