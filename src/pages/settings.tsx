import { useState } from "react";
import { useGetMe, useChangePassword, getGetMeQueryKey } from "@/workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  ShieldCheck,
  ShieldAlert,
  KeyRound,
  User as UserIcon,
  Check,
  X,
  Eye,
  EyeOff,
  AlertTriangle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

function getStrength(password: string) {
  if (!password) return null;
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  if (score <= 2) return { label: "Weak", color: "bg-red-500", textColor: "text-red-600", pct: 25 };
  if (score <= 3)
    return { label: "Fair", color: "bg-orange-400", textColor: "text-orange-500", pct: 50 };
  if (score <= 4)
    return { label: "Good", color: "bg-yellow-400", textColor: "text-yellow-600", pct: 75 };
  return { label: "Strong", color: "bg-green-500", textColor: "text-green-600", pct: 100 };
}

export default function Settings() {
  const { data: user } = useGetMe();
  const changePasswordMutation = useChangePassword();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const mustChangePassword = user?.mustChangePassword ?? false;

  const form = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const watchNewPassword = form.watch("newPassword");
  const strength = getStrength(watchNewPassword);

  const pwdCriteria = [
    { label: "8+ characters", test: (p: string) => p.length >= 8 },
    { label: "Uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
    { label: "Lowercase letter", test: (p: string) => /[a-z]/.test(p) },
    { label: "Number", test: (p: string) => /[0-9]/.test(p) },
    { label: "Special char", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
  ];

  const onSubmit = (values: z.infer<typeof passwordSchema>) => {
    changePasswordMutation.mutate(
      { data: { currentPassword: values.currentPassword, newPassword: values.newPassword } },
      {
        onSuccess: () => {
          toast({
            title: "Password updated successfully",
            description: "Your account is now secured with your new password.",
          });
          form.reset();
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        },
        onError: (error) => {
          toast({ variant: "destructive", title: "Update failed", description: error.message });
        },
      },
    );
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Account Settings</h2>
        <p className="text-muted-foreground">Manage your profile and security preferences.</p>
      </div>

      {/* Default password warning banner */}
      {mustChangePassword && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
          <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-amber-800 dark:text-amber-300 text-sm">
              Default password detected
            </p>
            <p className="text-amber-700 dark:text-amber-400 text-xs mt-0.5">
              Your account is still using the initial default password. Please change it now to
              secure your account.
            </p>
          </div>
          <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 border-0 text-xs shrink-0">
            Action required
          </Badge>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-1 space-y-6">
          <Card className="border-transparent shadow-sm text-center pt-6">
            <div className="mx-auto w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center text-primary mb-4">
              {user?.name ? (
                <span className="text-3xl font-bold">{user.name.charAt(0).toUpperCase()}</span>
              ) : (
                <UserIcon className="h-10 w-10" />
              )}
            </div>
            <CardHeader className="pt-0">
              <CardTitle>{user?.name}</CardTitle>
              <CardDescription>{user?.email}</CardDescription>
              <div className="mt-4 flex justify-center">
                <Badge
                  variant="outline"
                  className="uppercase tracking-widest text-[10px] px-3 py-1 rounded-full border-primary/20 text-primary bg-primary/5"
                >
                  {user?.role} Account
                </Badge>
              </div>
            </CardHeader>
          </Card>

          <Card className="border-transparent shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                Two-Factor Auth
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between p-4 bg-muted/30 rounded-2xl border">
                <div className="space-y-0.5">
                  <p className="font-medium text-sm">Status</p>
                  <p className="text-xs text-muted-foreground">
                    {user?.twoFactorEnabled
                      ? "Active and protecting your account."
                      : "Not configured yet."}
                  </p>
                </div>
                {user?.twoFactorEnabled ? (
                  <ShieldCheck className="h-6 w-6 text-green-500" />
                ) : (
                  <ShieldAlert className="h-6 w-6 text-amber-500" />
                )}
              </div>
            </CardContent>
            <CardFooter>
              {!user?.twoFactorEnabled && (
                <Button
                  className="w-full rounded-full"
                  variant="outline"
                  onClick={() => (window.location.href = "/2fa-setup")}
                >
                  Enable 2FA
                </Button>
              )}
            </CardFooter>
          </Card>
        </div>

        <div className="md:col-span-2">
          <Card
            className={cn(
              "border-transparent shadow-sm",
              mustChangePassword && "ring-2 ring-amber-400 dark:ring-amber-600",
            )}
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-primary" />
                Change Password
                {mustChangePassword && (
                  <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 border-0 text-xs ml-auto">
                    Required
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                {mustChangePassword
                  ? "You are using the default password — change it now to keep your account secure."
                  : "Update your password to keep your account secure."}
              </CardDescription>
            </CardHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)}>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="currentPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Current Password</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              type={showCurrent ? "text" : "password"}
                              {...field}
                              className="rounded-[20px] pr-10"
                              placeholder={mustChangePassword ? "Admin@123! (default)" : "••••••••"}
                            />
                            <button
                              type="button"
                              onClick={() => setShowCurrent((s) => !s)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                              tabIndex={-1}
                            >
                              {showCurrent ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="pt-4 border-t space-y-4">
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
                                {...field}
                                className="rounded-[20px] pr-10"
                                placeholder="Enter a strong password"
                              />
                              <button
                                type="button"
                                onClick={() => setShowNew((s) => !s)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                tabIndex={-1}
                              >
                                {showNew ? (
                                  <EyeOff className="h-4 w-4" />
                                ) : (
                                  <Eye className="h-4 w-4" />
                                )}
                              </button>
                            </div>
                          </FormControl>
                          <FormMessage />
                          {strength && (
                            <div className="space-y-1 mt-1">
                              <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                                <div
                                  className={cn(
                                    "h-full rounded-full transition-all duration-300",
                                    strength.color,
                                  )}
                                  style={{ width: `${strength.pct}%` }}
                                />
                              </div>
                              <p className={cn("text-xs font-medium", strength.textColor)}>
                                Strength: {strength.label}
                              </p>
                            </div>
                          )}
                        </FormItem>
                      )}
                    />

                    {watchNewPassword.length > 0 && (
                      <div className="bg-muted/30 p-4 rounded-[20px] text-xs">
                        <div className="grid grid-cols-2 gap-2">
                          {pwdCriteria.map((c, i) => {
                            const passed = c.test(watchNewPassword);
                            return (
                              <div key={i} className="flex items-center gap-1.5">
                                {passed ? (
                                  <Check className="h-3 w-3 text-green-500" />
                                ) : (
                                  <X className="h-3 w-3 text-muted-foreground" />
                                )}
                                <span
                                  className={cn(
                                    passed ? "text-foreground" : "text-muted-foreground",
                                  )}
                                >
                                  {c.label}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <FormField
                      control={form.control}
                      name="confirmPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Confirm New Password</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input
                                type={showConfirm ? "text" : "password"}
                                {...field}
                                className="rounded-[20px] pr-10"
                                placeholder="Repeat your new password"
                              />
                              <button
                                type="button"
                                onClick={() => setShowConfirm((s) => !s)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                tabIndex={-1}
                              >
                                {showConfirm ? (
                                  <EyeOff className="h-4 w-4" />
                                ) : (
                                  <Eye className="h-4 w-4" />
                                )}
                              </button>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
                <CardFooter className="bg-muted/10 border-t py-4">
                  <Button
                    type="submit"
                    className={cn(
                      "ml-auto rounded-full",
                      mustChangePassword && "bg-amber-600 hover:bg-amber-700 text-white",
                    )}
                    disabled={
                      changePasswordMutation.isPending ||
                      !pwdCriteria.every((c) => c.test(watchNewPassword))
                    }
                  >
                    {changePasswordMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    {mustChangePassword ? "Set Secure Password" : "Update Password"}
                  </Button>
                </CardFooter>
              </form>
            </Form>
          </Card>
        </div>
      </div>
    </div>
  );
}
