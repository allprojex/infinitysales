import { useAuth } from "@/lib/auth-context";
import { useOnlineUsers } from "@/hooks/use-online-users";

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

function relativeMins(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.max(0, Math.floor(ms / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h${mins % 60 ? ` ${mins % 60}m` : ""}`;
}

export function OnlineUsersWidget() {
  const { user } = useAuth();
  const { users, count } = useOnlineUsers();

  if (user?.role !== "admin") return null;

  return (
    <div
      className="mx-3 mb-2 rounded-lg border px-3 py-2"
      style={{
        background: "rgba(74, 103, 65, 0.18)",
        borderColor: "rgba(107, 142, 90, 0.4)",
      }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span
          className="h-2 w-2 rounded-full flex-shrink-0"
          style={{
            background: "#6b8e5a",
            animation: count > 0 ? "onlineUsersPulse 2s ease-in-out infinite" : "none",
          }}
        />
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#8ab87a" }}>
          Online Users
        </span>
        <span
          className="ml-auto text-[11px] font-bold px-1.5 py-0.5 rounded"
          style={{ background: "rgba(107,142,90,0.25)", color: "#8ab87a" }}
        >
          {count}
        </span>
      </div>

      <style>{`
        @keyframes onlineUsersPulse {
          0% { box-shadow: 0 0 0 0 rgba(107,142,90,0.7); }
          70% { box-shadow: 0 0 0 6px rgba(107,142,90,0); }
          100% { box-shadow: 0 0 0 0 rgba(107,142,90,0); }
        }
      `}</style>

      {count === 0 ? (
        <p className="text-[10px]" style={{ color: "rgba(138,184,122,0.5)" }}>No active sessions</p>
      ) : (
        <ul className="space-y-1">
          {users.slice(0, 6).map((u) => (
            <li key={u.id} className="flex items-center gap-1.5">
              <span
                className="h-1.5 w-1.5 rounded-full flex-shrink-0"
                style={{ background: "#6b8e5a", animation: "onlineUsersPulse 2s ease-in-out infinite" }}
              />
              <span className="text-[10px] truncate flex-1" style={{ color: "rgba(138,184,122,0.85)" }}>
                {u.userName}
              </span>
              <span
                className="text-[9px] flex-shrink-0 tabular-nums"
                style={{ color: "rgba(138,184,122,0.55)" }}
                title={`Logged in ${new Date(u.loginAt).toLocaleString()}`}
              >
                {relativeMins(u.loginAt)}
              </span>
              <span
                className="text-[9px] px-1 py-0.5 rounded flex-shrink-0"
                style={{ background: "rgba(107,142,90,0.15)", color: "rgba(138,184,122,0.6)" }}
              >
                {roleLabel(u.role)}
              </span>
            </li>
          ))}
          {count > 6 && (
            <li className="text-[9px]" style={{ color: "rgba(138,184,122,0.45)" }}>
              +{count - 6} more
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
