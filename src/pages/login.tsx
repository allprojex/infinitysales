import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Eye, EyeOff, ShieldCheck, User } from "lucide-react";
import { useLogin, type LoginMutationBody } from "@/workspace/api-client-react";
import { cn } from "@/lib/utils";
import { postLoginPath } from "@/lib/auth-routing";

const loginSchema = z.object({
  identifier: z.string().min(1, { message: "Username or email is required" }),
  password: z.string().min(1, { message: "Password is required" }),
});

type LoginValues = z.infer<typeof loginSchema>;
type PortalLoginBody = LoginMutationBody & {
  portal: "admin" | "user";
  timezone: string;
  screenRes: string;
};

function getPasswordStrength(password: string) {
  if (!password) return null;
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  if (score <= 2) return { label: "Weak", color: "bg-red-500", textColor: "text-red-600", pct: 25 };
  if (score <= 3) return { label: "Fair", color: "bg-orange-400", textColor: "text-orange-500", pct: 50 };
  if (score <= 4) return { label: "Good", color: "bg-yellow-400", textColor: "text-yellow-600", pct: 75 };
  return { label: "Strong", color: "bg-green-500", textColor: "text-green-600", pct: 100 };
}

function LoginForm({ mode }: { mode: "admin" | "user" }) {
  const [_, setLocation] = useLocation();
  const { login: setAuthContext, clearSession } = useAuth();
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const loginMutation = useLogin();

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      identifier: mode === "admin" ? "admin@infinitysi.com" : "",
      password: "",
    },
  });

  const watchedPassword = form.watch("password");
  const strength = getPasswordStrength(watchedPassword);

  const onSubmit = (values: LoginValues) => {
    // Enrich login body with client-side signals used for device fingerprinting.
    // The server hashes UA + timezone + screenRes + platform to detect new devices.
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    const screenRes = `${window.screen.width}x${window.screen.height}`;
    const payload: PortalLoginBody = {
      email: values.identifier,
      password: values.password,
      portal: mode,
      timezone,
      screenRes,
    };
    loginMutation.mutate(
      { data: payload },
      {
        onSuccess: (data) => {
          if (data.accessToken && data.user) {
            setAuthContext(data.accessToken, data.user, data.refreshToken);
            setLocation(postLoginPath(data.user.role));
          } else if (data.requiresTwoFactor) {
            sessionStorage.setItem("tempToken", data.tempToken || "");
            setLocation("/2fa-verify");
          } else if (data.requires2FASetup) {
            sessionStorage.setItem("tempToken", data.tempToken || "");
            setLocation("/2fa-setup");
          }
        },
        onError: (err) => {
          if ((err as { status?: number }).status === 403) {
            clearSession();
          }
          toast({
            variant: "destructive",
            title: "Login Failed",
            description: err.message || "Invalid credentials. Please try again.",
          });
        },
      }
    );
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="identifier"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Username or Email</FormLabel>
              <FormControl>
                <Input
                  placeholder={mode === "admin" ? "admin@infinitysi.com" : "Enter your email"}
                  autoComplete="username"
                  {...field}
                  className="rounded-[20px]"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <div className="relative">
                  <Input
                    placeholder="••••••••"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    {...field}
                    className="rounded-[20px] pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label="Toggle password visibility"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </FormControl>
              <FormMessage />
              {strength && (
                <div className="space-y-1 pt-1">
                  <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all duration-300", strength.color)}
                      style={{ width: `${strength.pct}%` }}
                    />
                  </div>
                  <p className={cn("text-xs font-medium", strength.textColor)}>
                    Password strength: {strength.label}
                  </p>
                </div>
              )}
            </FormItem>
          )}
        />

        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-xs text-muted-foreground hover:text-primary hover:underline">
            Forgot your password?
          </Link>
        </div>

        <Button
          type="submit"
          className={cn("w-full rounded-[40px]", mode === "admin" ? "bg-[#005f8a] hover:bg-[#004d73]" : "")}
          size="lg"
          disabled={loginMutation.isPending}
        >
          {loginMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {mode === "admin" ? "Sign In as Admin" : "Sign In"}
        </Button>
      </form>
    </Form>
  );
}

export default function Login({ initialMode = "user" }: { initialMode?: "admin" | "user" }) {
  const [activeTab, setActiveTab] = useState<"admin" | "user">(initialMode);

  useEffect(() => {
    setActiveTab(initialMode);
  }, [initialMode]);

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
      {/* Header banner */}
      <div className="w-full py-6 px-8 flex flex-col items-center gap-3" style={{ background: "linear-gradient(135deg, #002d42 0%, #005f8a 55%, #0087b5 100%)" }}>
        <img src="/logo.jpeg" alt="Infinity Techub Intelligence" className="h-14 w-auto object-contain rounded-xl shadow-lg" />
        <div className="text-center">
          <h1 className="text-white text-xl font-extrabold tracking-tight">Sign In to Infinity Sales &amp; Inventory</h1>
        </div>
        <div className="flex items-center gap-6 mt-1">
          {(["Sales Tracking", "Inventory Control", "POS Terminal", "Financial Reports"] as const).map((f) => (
            <span key={f} className="hidden sm:block text-white/50 text-[11px]">{f}</span>
          ))}
        </div>
      </div>

      {/* Login cards */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 bg-muted/30">
        <div className="w-full max-w-3xl">
          <p className="text-center text-muted-foreground text-sm mb-6">Select your login portal and sign in</p>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Admin Login Card */}
            <div
              className={cn(
                "rounded-2xl border bg-card shadow-sm p-6 flex flex-col gap-5 cursor-pointer transition-all",
                activeTab === "admin" ? "ring-2 ring-[#005f8a] shadow-lg" : "hover:shadow-md"
              )}
              onClick={() => setActiveTab("admin")}
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #002d42, #0087b5)" }}>
                  <ShieldCheck className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h2 className="font-bold text-base">Admin Login</h2>
                  <p className="text-xs text-muted-foreground">Full system access</p>
                </div>
                {activeTab === "admin" && (
                  <div className="ml-auto h-2 w-2 rounded-full bg-[#005f8a]" />
                )}
              </div>

              {activeTab === "admin" && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                  <LoginForm mode="admin" />
                </div>
              )}

              {activeTab !== "admin" && (
                <div className="text-center py-4">
                  <p className="text-sm text-muted-foreground">Click to sign in as administrator</p>
                  <Button variant="outline" size="sm" className="mt-3 rounded-full" onClick={() => setActiveTab("admin")}>
                    Admin Sign In
                  </Button>
                </div>
              )}
            </div>

            {/* User Login Card */}
            <div
              className={cn(
                "rounded-2xl border bg-card shadow-sm p-6 flex flex-col gap-5 cursor-pointer transition-all",
                activeTab === "user" ? "ring-2 ring-primary shadow-lg" : "hover:shadow-md"
              )}
              onClick={() => setActiveTab("user")}
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center">
                  <User className="h-5 w-5 text-primary-foreground" />
                </div>
                <div>
                  <h2 className="font-bold text-base">User Login</h2>
                  <p className="text-xs text-muted-foreground">Staff &amp; operator access</p>
                </div>
                {activeTab === "user" && (
                  <div className="ml-auto h-2 w-2 rounded-full bg-primary" />
                )}
              </div>

              {activeTab === "user" && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                  <LoginForm mode="user" />
                </div>
              )}

              {activeTab !== "user" && (
                <div className="text-center py-4">
                  <p className="text-sm text-muted-foreground">Click to sign in as a staff member</p>
                  <Button variant="outline" size="sm" className="mt-3 rounded-full" onClick={() => setActiveTab("user")}>
                    User Sign In
                  </Button>
                </div>
              )}
            </div>
          </div>

          <div className="text-center text-sm mt-6">
            <span className="text-muted-foreground">Don't have an account? </span>
            <Link href="/register" className="text-primary font-medium hover:underline">
              Register here
            </Link>
          </div>

          <p className="text-[11px] text-center text-muted-foreground/50 mt-4">
            Powered by Infinity Techub Intelligence. All rights reserved (2026).
          </p>
        </div>
      </div>
    </div>
  );
}
