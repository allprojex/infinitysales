
-- Fix 1: Remove duplicate RLS policy on ip_blocks
DROP POLICY IF EXISTS "own ip blocks" ON public.ip_blocks;

-- Fix 2: Restrict Realtime channel subscriptions
--
-- realtime.messages is a Supabase-managed table, owned by
-- supabase_realtime_admin, not by the role migrations run as. On every
-- environment this migration has already applied to, RLS is already enabled
-- on it at project-provisioning time, so a plain `ALTER TABLE ... ENABLE ROW
-- LEVEL SECURITY` here is a no-op that happens to succeed only because that
-- role has enough privilege at the time. On a freshly created hosted Supabase
-- project the same statement fails with "must be owner of table messages".
-- This guard makes the statement's actual precondition explicit instead of
-- assuming ownership: skip if RLS is already enabled (already-migrated
-- environments hit this branch and nothing changes), enable it only if this
-- role genuinely owns the table, and fail loudly - never silently - if
-- neither holds, since that would be a real, unresolved problem.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'realtime' AND c.relname = 'messages' AND c.relrowsecurity = true
  ) THEN
    NULL;
  ELSIF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'realtime' AND c.relname = 'messages'
      AND pg_has_role(current_user, c.relowner, 'USAGE')
  ) THEN
    ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
  ELSE
    RAISE EXCEPTION 'realtime.messages has RLS disabled and this role does not own it; needs manual review';
  END IF;
END $$;

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
