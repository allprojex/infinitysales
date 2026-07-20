-- ISSUE-008: POST /api/sales performed insert-sale, decrement-stock,
-- update-customer-spend and record-customer-receivable as separate,
-- unguarded statements. A failure partway through left a "completed" sale
-- committed with some of its side effects silently missing (no stock
-- deduction, no spend tracking, or no credit charge). This wraps all four
-- writes in one real Postgres transaction, mirroring the existing
-- complete_purchase_return/reverse_purchase_return precedent
-- (20260718210000_complete_purchase_returns.sql).
--
-- Scope: only the mutations. All validation, pricing, promotion-discount
-- calculation and id/location resolution stay in TypeScript (sales.ts,
-- -sales-helpers.ts) exactly as before, since they're pure reads/computation
-- with no atomicity risk of their own — this function receives their
-- already-computed output as p_sale and p_credit_amount.
--
-- Stock-balance accounting (v_movement_count / fallback-to-products.stock)
-- deliberately replicates -stock-helpers.ts's warehouseBalance()/
-- recordStockMovement() logic exactly, so behavior for existing data is
-- unchanged. products.id/products.stock are row-locked (FOR UPDATE) before
-- the read-modify-write, closing the lost-update race that plain
-- select-then-update from the API layer could not.
CREATE OR REPLACE FUNCTION public.create_sale_atomic(
  p_user_id uuid,
  p_sale jsonb,
  p_credit_amount numeric
)
RETURNS public.sales
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sale public.sales%ROWTYPE;
  v_item jsonb;
  v_product_id uuid;
  v_quantity numeric;
  v_cost numeric;
  v_warehouse_id uuid;
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

  -- decrementProductStock(): only completed sales move stock.
  IF v_sale.status = 'completed' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_sale.items, '[]'::jsonb))
    LOOP
      v_product_id := NULLIF(COALESCE(v_item->>'productId', v_item->>'product_id'), '')::uuid;
      v_quantity := COALESCE((v_item->>'quantity')::numeric, (v_item->>'qty')::numeric, 0);
      IF v_product_id IS NULL OR v_quantity <= 0 THEN CONTINUE; END IF;
      v_cost := COALESCE((v_item->>'cost')::numeric, 0);

      SELECT stock, warehouse_id INTO v_product_stock, v_product_warehouse_id
      FROM public.products WHERE id = v_product_id AND user_id = p_user_id FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Product % not found', v_product_id;
      END IF;

      -- adjustProductStock(): flat stock pool, floored at 0.
      UPDATE public.products
      SET stock = GREATEST(COALESCE(v_product_stock, 0) - v_quantity, 0)
      WHERE id = v_product_id;

      -- recordStockMovement(): only when the sale is warehouse-scoped.
      IF v_warehouse_id IS NOT NULL THEN
        SELECT COALESCE(sum(quantity), 0), count(*) INTO v_movement_balance, v_movement_count
        FROM public.stock_movements
        WHERE user_id = p_user_id AND product_id = v_product_id AND warehouse_id = v_warehouse_id;

        -- warehouseBalance(): no movement history yet -> fall back to the
        -- product's own flat stock, but only if it's assigned to this same
        -- warehouse; otherwise the warehouse-scoped balance is 0.
        IF v_movement_count = 0 THEN
          IF v_product_warehouse_id IS NOT DISTINCT FROM v_warehouse_id THEN
            v_movement_balance := COALESCE(v_product_stock, 0);
          ELSE
            v_movement_balance := 0;
          END IF;
        END IF;

        v_balance_after := v_movement_balance - v_quantity;
        INSERT INTO public.stock_movements(
          user_id, product_id, warehouse_id, movement_type, quantity, unit_cost,
          balance_after, reference_type, reference_id, reason, created_by
        ) VALUES (
          p_user_id, v_product_id, v_warehouse_id, 'sale', -v_quantity, v_cost,
          v_balance_after, 'sale', v_sale.id, 'Sale completed', p_user_id
        );
      END IF;
    END LOOP;
  END IF;

  v_customer_id := v_sale.customer_id;
  v_total := COALESCE(v_sale.total, 0);

  -- updateCustomerSpend(): only completed sales count toward spend.
  IF v_customer_id IS NOT NULL AND v_total > 0 AND v_sale.status = 'completed' THEN
    UPDATE public.customers
    SET total_spend = COALESCE(total_spend, 0) + v_total
    WHERE user_id = p_user_id AND uuid_id = v_customer_id;
  END IF;

  -- recordCustomerReceivable(): status-independent, matching the original
  -- (a pending/unpaid sale can still charge a receivable). p_credit_amount
  -- is pre-computed in TypeScript by the existing, unchanged
  -- creditChargeAmount() — a pure function of already-known values, not
  -- worth re-deriving in SQL.
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
$$;

REVOKE ALL ON FUNCTION public.create_sale_atomic(uuid, jsonb, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_sale_atomic(uuid, jsonb, numeric) TO service_role;

NOTIFY pgrst, 'reload schema';
