import { useState } from "react";
import { Users, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import { useOnlineUsers, type OnlineUser } from "@/hooks/use-online-users";

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "just now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  const rmins = mins % 60;
  if (hrs < 24) return rmins ? `${hrs}h ${rmins}m ago` : `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatLoginTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function roleLabel(role: string): string {
  const map: Record<string, string> = {
    admin: "Admin",
    manager: "Manager",
    cashier: "Cashier",
    accountant: "Accountant",
    user: "User",
  };
  return map[role] ?? role;
}

export function OnlineUsersButton() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const { users, count, refetch, isLoading } = useOnlineUsers();

  if (user?.role !== "admin") return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 relative"
          title={`${count} user${count === 1 ? "" : "s"} online`}
          aria-label="Online users"
        >
          <Users className="h-4 w-4" />
          <span
            className="absolute bottom-1 right-1 h-2 w-2 rounded-full border-[1.5px] border-background bg-emerald-500"
            style={{
              animation: count > 0 ? "onlineUsersDot 1.4s ease-in-out infinite" : "none",
              boxShadow: count > 0 ? "0 0 0 0 rgba(16,185,129,0.7)" : undefined,
            }}
          />
          {count > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center bg-emerald-500 text-white border-[1.5px] border-background tabular-nums">
              {count > 99 ? "99+" : count}
            </span>
          )}
          <style>{`
            @keyframes onlineUsersDot {
              0% { box-shadow: 0 0 0 0 rgba(16,185,129,0.75); opacity: 1; }
              60% { box-shadow: 0 0 0 6px rgba(16,185,129,0); opacity: 0.45; }
              100% { box-shadow: 0 0 0 0 rgba(16,185,129,0); opacity: 1; }
            }
          `}</style>
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <div className="flex items-center gap-2">
            <span
              className="h-2 w-2 rounded-full bg-emerald-500"
              style={{ animation: count > 0 ? "onlineUsersDot 1.4s ease-in-out infinite" : "none" }}
            />
            <span className="text-sm font-semibold">Online now</span>
            <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 border-0 text-xs">
              {count}
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => refetch()}
            title="Refresh"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {count === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
            No users online right now
          </div>
        ) : (
          <ul className="max-h-80 overflow-y-auto py-1">
            {users.map((u: OnlineUser) => (
              <li
                key={u.id}
                className="flex items-start gap-2.5 px-3 py-2 hover:bg-muted/50 transition-colors"
              >
                <div className="relative h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-xs flex-shrink-0 mt-0.5">
                  {(u.userName?.[0] ?? "U").toUpperCase()}
                  <span
                    className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-background"
                    style={{ animation: "onlineUsersDot 1.4s ease-in-out infinite" }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{u.userName}</p>
                    <Badge variant="outline" className="text-[10px] py-0 h-4 px-1.5">
                      {roleLabel(u.role)}
                    </Badge>
                  </div>
                  {u.email && (
                    <p className="text-[11px] text-muted-foreground truncate">{u.email}</p>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    Logged in {formatLoginTime(u.loginAt)} · {relativeTime(u.loginAt)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="px-3 py-1.5 border-t text-[10px] text-muted-foreground text-center">
          Live · refreshes automatically
        </div>
      </PopoverContent>
    </Popover>
  );
}
