import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";

// Keep in sync with package.json "version". This is a constant rather than a
// JSON import so it works regardless of tsconfig resolveJsonModule settings
// and ships as a tiny inlined string in the client bundle.
export const APP_VERSION = "1.0.0";

/**
 * Admin-only "Current App Version" indicator.
 * Hidden for non-admins; renders an unobtrusive badge for admins.
 */
export function AppVersionBadge({ className }: { className?: string }) {
  const { user } = useAuth();
  if (user?.role !== "admin") return null;

  const env = import.meta.env.MODE === "production" ? "prod" : import.meta.env.MODE;

  return (
    <Badge
      variant="outline"
      title={`Application version ${APP_VERSION} (${env})`}
      aria-label={`Application version ${APP_VERSION}`}
      className={
        "h-6 px-2 text-[10px] font-mono tracking-tight text-muted-foreground border-border/60 bg-background/60 " +
        (className ?? "")
      }
      data-testid="app-version-badge"
    >
      <span className="mr-1 opacity-70">v</span>
      <span className="tabular-nums">{APP_VERSION}</span>
    </Badge>
  );
}
