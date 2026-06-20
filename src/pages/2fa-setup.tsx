import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ShieldCheck } from "lucide-react";

interface SetupData {
  qrCodeDataUrl: string;
  otpauthUrl: string;
}

export default function Setup2FA() {
  const [_, setLocation] = useLocation();
  const { login } = useAuth();
  const { toast } = useToast();
  const [token, setToken] = useState("");
  const [setupData, setSetupData] = useState<SetupData | null>(null);
  const [setupLoading, setSetupLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);

  const tempToken = typeof window !== "undefined" ? sessionStorage.getItem("tempToken") : null;

  useEffect(() => {
    if (!tempToken) {
      setLocation("/login");
      return;
    }

    const controller = new AbortController();
    fetch("/api/auth/setup-2fa", {
      headers: { Authorization: `Bearer ${tempToken}` },
      signal: controller.signal,
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<SetupData>;
      })
      .then(setSetupData)
      .catch(() => {
        toast({ variant: "destructive", title: "Setup failed", description: "Could not load 2FA setup. Please sign in again." });
        setLocation("/login");
      })
      .finally(() => setSetupLoading(false));

    return () => controller.abort();
  }, []);

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (token.length !== 6 || !tempToken) return;

    setConfirming(true);
    try {
      const res = await fetch("/api/auth/confirm-2fa", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tempToken}`,
        },
        body: JSON.stringify({ token }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast({ variant: "destructive", title: "Verification Failed", description: data.message || "Invalid code." });
        return;
      }

      sessionStorage.removeItem("tempToken");

      if (data.accessToken && data.user) {
        login(data.accessToken, data.user, data.refreshToken);
      }

      toast({ title: "2FA Enabled", description: "Two-factor authentication is now active." });
      setLocation("/dashboard");
    } catch {
      toast({ variant: "destructive", title: "Network error", description: "Please try again." });
    } finally {
      setConfirming(false);
    }
  };

  if (!tempToken) return null;

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-muted/30 p-4">
      <div className="max-w-md w-full bg-card border rounded-3xl p-8 shadow-xl">
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <ShieldCheck className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Secure Your Account</h1>
          <p className="text-muted-foreground mt-2">
            Set up Two-Factor Authentication (2FA) to complete sign-in.
          </p>
        </div>

        {setupLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : setupData ? (
          <div className="space-y-6">
            <div className="flex flex-col items-center gap-4 bg-white p-4 rounded-2xl border">
              {setupData.qrCodeDataUrl ? (
                <img src={setupData.qrCodeDataUrl} alt="QR Code" className="w-48 h-48" />
              ) : (
                <div className="w-48 h-48 bg-muted animate-pulse rounded" />
              )}
              <p className="text-sm text-center text-muted-foreground">
                Scan this QR code with an authenticator app like Google Authenticator or Authy.
              </p>
            </div>

            <div className="pt-4 border-t">
              <form onSubmit={handleConfirm} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="token" className="text-sm font-medium">
                    Verify Code
                  </label>
                  <Input
                    id="token"
                    name="token"
                    placeholder="000000"
                    maxLength={6}
                    value={token}
                    onChange={(e) => setToken(e.target.value.replace(/\D/g, ""))}
                    className="text-center tracking-widest text-lg h-12 rounded-[20px]"
                    autoFocus
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full rounded-[40px]"
                  size="lg"
                  disabled={confirming || token.length !== 6}
                >
                  {confirming && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Verify & Enable
                </Button>
              </form>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
