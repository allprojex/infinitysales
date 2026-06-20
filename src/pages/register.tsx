import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useRegister } from "@/workspace/api-client-react";
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
import heroImg from "@/assets/attached/screenshot-1777688187408.png";
import { Loader2, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

const registerSchema = z.object({
  name: z.string().min(2, { message: "Name must be at least 2 characters" }),
  email: z.string().email({ message: "Invalid email address" }),
  password: z.string().min(8, { message: "Password must be at least 8 characters" }),
});

export default function Register() {
  const [_, setLocation] = useLocation();
  const { login: setAuthContext } = useAuth();
  const { toast } = useToast();
  const registerMutation = useRegister();

  const form = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
    },
  });

  const watchPassword = form.watch("password");

  const pwdCriteria = [
    { label: "8+ characters", test: (p: string) => p.length >= 8 },
    { label: "Uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
    { label: "Lowercase letter", test: (p: string) => /[a-z]/.test(p) },
    { label: "Number", test: (p: string) => /[0-9]/.test(p) },
    { label: "Special character", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
  ];

  const onSubmit = (values: z.infer<typeof registerSchema>) => {
    registerMutation.mutate(
      { data: { ...values, role: "user" } },
      {
        onSuccess: (data) => {
          const resp = data as { accessToken?: string; refreshToken?: string; user?: any };
          if (resp.accessToken && resp.user) {
            setAuthContext(resp.accessToken, resp.user, resp.refreshToken);
            toast({ title: "Welcome!", description: "Account created. Redirecting to POS Terminal..." });
            setLocation("/pos");
          } else {
            toast({ title: "Account created", description: "Please sign in to continue." });
            setLocation("/login");
          }
        },
        onError: (error) => {
          toast({
            variant: "destructive",
            title: "Registration Failed",
            description: error.message || "An error occurred.",
          });
        },
      }
    );
  };

  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row bg-background">
      <div className="flex-1 flex flex-col justify-center items-center p-8 md:p-12 lg:p-24 relative z-10">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center md:text-left space-y-2">
            <img
              src="/logo.jpeg"
              alt="Infinity Techub Intelligence"
              className="h-16 w-auto mx-auto md:mx-0 mb-6 object-contain"
            />
            <h1 className="text-3xl font-bold tracking-tight">Create an account</h1>
            <p className="text-muted-foreground">
              Join the sales management platform
            </p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="John Doe"
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
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="name@example.com"
                        type="email"
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
                      <Input
                        placeholder="••••••••"
                        type="password"
                        {...field}
                        className="rounded-[20px]"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-2 bg-muted/50 p-4 rounded-[20px] text-sm">
                <p className="font-medium mb-2">Password requirements:</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {pwdCriteria.map((c, i) => {
                    const passed = c.test(watchPassword);
                    return (
                      <div key={i} className="flex items-center gap-2">
                        {passed ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <X className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className={cn("text-xs", passed ? "text-foreground" : "text-muted-foreground")}>
                          {c.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <Button
                type="submit"
                className="w-full rounded-[40px]"
                size="lg"
                disabled={registerMutation.isPending || !pwdCriteria.every((c) => c.test(watchPassword))}
              >
                {registerMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Register
              </Button>
            </form>
          </Form>

          <div className="text-center text-sm">
            <span className="text-muted-foreground">Already have an account? </span>
            <Link href="/login" className="text-primary font-medium hover:underline">
              Sign in here
            </Link>
          </div>
        </div>
      </div>

      <div className="hidden md:flex flex-1 relative overflow-hidden" style={{ background: "linear-gradient(150deg, #7B2D42 0%, #1a2b5c 50%, #0D1B3E 100%)" }}>
        <div className="absolute inset-0 opacity-15" style={{
          backgroundImage: "radial-gradient(circle at 25% 45%, rgba(255,255,255,0.2) 0%, transparent 55%)",
        }} />
        <img
          src={heroImg}
          alt="Dashboard preview"
          className="absolute inset-0 w-full h-full object-cover opacity-80"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent z-20" />
      </div>
    </div>
  );
}
