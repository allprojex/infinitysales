
-- Fix 1: Remove duplicate RLS policy on ip_blocks
DROP POLICY IF EXISTS "own ip blocks" ON public.ip_blocks;

-- Fix 2: Restrict Realtime channel subscriptions
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can subscribe to user_sessions feeds" ON realtime.messages;
CREATE POLICY "Admins can subscribe to user_sessions feeds"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  CASE
    WHEN realtime.topic() LIKE 'user_sessions_admin%'
      THEN public.has_role(auth.uid(), 'admin'::public.app_role)
    ELSE true
  END
);
