
CREATE TABLE public.ai_key_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source TEXT NOT NULL,
  upstream_status INTEGER NOT NULL,
  error_excerpt TEXT,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.ai_key_alerts TO authenticated;
GRANT ALL ON public.ai_key_alerts TO service_role;

ALTER TABLE public.ai_key_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read AI key alerts"
  ON public.ai_key_alerts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can acknowledge AI key alerts"
  ON public.ai_key_alerts FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX idx_ai_key_alerts_unack ON public.ai_key_alerts (created_at DESC) WHERE acknowledged_at IS NULL;
