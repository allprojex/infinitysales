import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useVerify2fa } from "@/workspace/api-client-react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ShieldCheck } from "lucide-react";

export default function Verify2FA() {
  const [_, setLocation] = useLocation();
  const { login } = useAuth();
  const { toast } = useToast();
  const [token, setToken] = useState("");
  const verifyMutation = useVerify2fa();
  const tempToken = typeof window !== "undefined" ? sessionStorage.getItem("tempToken") : null;

  useEffect(() => {
    if (!tempToken) {
      setLocation("/login");
    }
  }, [tempToken, setLocation]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (token.length !== 6 || !tempToken) return;

    verifyMutation.mutate(
      { data: { token, tempToken } },
      {
        onSuccess: (data) => {
          sessionStorage.removeItem("tempToken");
          login(data.accessToken, data.user, data.refreshToken);
          setLocation("/dashboard");
        },
        onError: (error) => {
          toast({
            variant: "destructive",
            title: "Verification Failed",
            description: error.message || "Invalid code.",
          });
        },
      },
    );
  };

  if (!tempToken) return null;

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-muted/30 p-4">
      <div className="max-w-md w-full bg-card border rounded-3xl p-8 shadow-xl text-center">
        <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-6">
          <ShieldCheck className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight mb-2">Two-Factor Authentication</h1>
        <p className="text-muted-foreground mb-8">
          Enter the 6-digit code from your authenticator app.
        </p>

        <form onSubmit={onSubmit} className="space-y-6">
          <div className="space-y-2 text-left">
            <Input
              id="token"
              name="token"
              placeholder="000000"
              maxLength={6}
              value={token}
              onChange={(e) => setToken(e.target.value.replace(/\D/g, ""))}
              className="text-center tracking-widest text-2xl h-14 rounded-[20px]"
              autoFocus
            />
          </div>
          <Button
            type="submit"
            className="w-full rounded-[40px]"
            size="lg"
            disabled={verifyMutation.isPending || token.length !== 6}
          >
            {verifyMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Verify
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full rounded-[40px]"
            onClick={() => setLocation("/login")}
          >
            Back to login
          </Button>
        </form>
      </div>
    </div>
  );
}
