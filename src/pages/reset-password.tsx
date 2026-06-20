import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Lock, Eye, EyeOff, ArrowLeft, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

function getStrength(password: string): { score: number; label: string; color: string } {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 2) return { score: Math.round((score / 6) * 100), label: "Weak", color: "bg-red-500" };
  if (score <= 4) return { score: Math.round((score / 6) * 100), label: "Fair", color: "bg-amber-500" };
  if (score === 5) return { score: Math.round((score / 6) * 100), label: "Strong", color: "bg-blue-500" };
  return { score: 100, label: "Very Strong", color: "bg-green-500" };
}

const resetSchema = z
  .object({
    newPassword: z
      .string()
      .min(8, "Minimum 8 characters")
      .regex(/[A-Z]/, "Must contain an uppercase letter")
      .regex(/[a-z]/, "Must contain a lowercase letter")
      .regex(/[0-9]/, "Must contain a number")
      .regex(/[^A-Za-z0-9]/, "Must contain a special character"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type ResetValues = z.infer<typeof resetSchema>;

export default function ResetPassword() {
  const [_, setLocation] = useLocation();
  const { toast } = useToast();
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [done, setDone] = useState(false);

  const params = new URLSearchParams(window.location.search);
  const resetToken = params.get("token") ?? "";

  const form = useForm<ResetValues>({
    resolver: zodResolver(resetSchema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  const newPasswordValue = form.watch("newPassword");
  const strength = getStrength(newPasswordValue);

  const onSubmit = async (values: ResetValues) => {
    if (!resetToken) {
      toast({ variant: "destructive", title: "Invalid link", description: "This reset link is missing a token." });
      return;
    }
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetToken, newPassword: values.newPassword }),
      });
      const data = (await res.json()) as { message: string };
      if (!res.ok) throw new Error(data.message);
      setDone(true);
      toast({ title: "Password reset", description: "Your password has been updated." });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Reset failed",
        description: err instanceof Error ? err.message : "Invalid or expired token.",
      });
    }
  };

  if (!resetToken) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-muted/30 p-4">
        <div className="max-w-md w-full text-center space-y-4 bg-card border rounded-3xl p-8 shadow-xl">
          <Lock className="h-12 w-12 text-destructive mx-auto" />
          <h1 className="text-xl font-bold">Invalid Reset Link</h1>
          <p className="text-sm text-muted-foreground">
            This password reset link is invalid or has expired. Please request a new one.
          </p>
          <Link href="/forgot-password">
            <Button className="w-full rounded-[40px] mt-2">Request New Link</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-muted/30 p-4">
      <div className="max-w-md w-full space-y-6">
        <div className="text-center">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <Lock className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Set New Password</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Choose a strong password for your account.
          </p>
        </div>

        {done ? (
          <div className="bg-card border rounded-3xl p-8 text-center space-y-4">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
            <h2 className="text-lg font-semibold">Password Updated!</h2>
            <p className="text-sm text-muted-foreground">
              Your password has been reset successfully. You can now sign in with your new password.
            </p>
            <Button
              className="w-full rounded-[40px]"
              onClick={() => setLocation("/login")}
            >
              Go to Sign In
            </Button>
          </div>
        ) : (
          <div className="bg-card border rounded-3xl p-8 shadow-xl">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                <FormField
                  control={form.control}
                  name="newPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={showNew ? "text" : "password"}
                            placeholder="••••••••"
                            autoComplete="new-password"
                            {...field}
                            className="rounded-[20px] pr-10"
                          />
                          <button
                            type="button"
                            onClick={() => setShowNew((s) => !s)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            tabIndex={-1}
                          >
                            {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </FormControl>

                      <div className="space-y-1 mt-2" aria-label="password-strength">
                        <Progress value={newPasswordValue ? strength.score : 0} className={cn("h-1.5", newPasswordValue ? strength.color : "bg-muted")} />
                        <p className={cn("text-xs font-medium", {
                          "text-muted-foreground": !newPasswordValue,
                          "text-red-500": newPasswordValue && strength.label === "Weak",
                          "text-amber-500": newPasswordValue && strength.label === "Fair",
                          "text-blue-500": newPasswordValue && strength.label === "Strong",
                          "text-green-600": newPasswordValue && strength.label === "Very Strong",
                        })}>
                          {newPasswordValue ? strength.label : "Password strength"}
                        </p>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={showConfirm ? "text" : "password"}
                            placeholder="••••••••"
                            autoComplete="new-password"
                            {...field}
                            className="rounded-[20px] pr-10"
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirm((s) => !s)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            tabIndex={-1}
                          >
                            {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className="w-full rounded-[40px]"
                  size="lg"
                  disabled={form.formState.isSubmitting}
                >
                  {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Reset Password
                </Button>
              </form>
            </Form>

            <div className="mt-6 text-center">
              <Link href="/login" className="text-sm text-primary hover:underline inline-flex items-center gap-1">
                <ArrowLeft className="h-3 w-3" />
                Back to Sign In
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
