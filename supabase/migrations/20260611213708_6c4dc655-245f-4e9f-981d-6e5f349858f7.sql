-- 1. Products: remove cross-tenant SELECT, allow owners + admins/managers
DROP POLICY IF EXISTS "authenticated users can view all products" ON public.products;

DROP POLICY IF EXISTS "admins and managers can view all products" ON public.products;
CREATE POLICY "admins and managers can view all products"
  ON public.products FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'manager'::public.app_role)
  );

-- "own products" (ALL using auth.uid() = user_id) already exists and covers owner reads/writes.

-- 2. Realtime: lock down non-admin topics to the subscribing user's own id
DROP POLICY IF EXISTS "Admins can subscribe to user_sessions feeds" ON realtime.messages;

CREATE POLICY "Scoped realtime subscriptions"
  ON realtime.messages FOR SELECT
  TO authenticated
  USING (
    CASE
      WHEN realtime.topic() LIKE 'user_sessions_admin%'
        THEN public.has_role(auth.uid(), 'admin'::public.app_role)
      WHEN realtime.topic() LIKE ('user:' || auth.uid()::text || '%')
        THEN true
      WHEN realtime.topic() = 'app-realtime-sync'
        THEN true
      ELSE false
    END
  );