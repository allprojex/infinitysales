DROP POLICY IF EXISTS "Scoped realtime subscriptions" ON realtime.messages;

CREATE POLICY "Scoped realtime subscriptions"
  ON realtime.messages FOR SELECT
  TO authenticated
  USING (
    CASE
      WHEN realtime.topic() LIKE 'user_sessions_admin%'
        THEN public.has_role(auth.uid(), 'admin'::public.app_role)
      WHEN realtime.topic() LIKE ('user:' || auth.uid()::text || '%')
        THEN true
      WHEN realtime.topic() = ('app-realtime-sync:' || auth.uid()::text)
        THEN true
      ELSE false
    END
  );