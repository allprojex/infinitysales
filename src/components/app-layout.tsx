import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import { usePermissions } from "@/lib/permissions-context";

import { usePosConnection } from "@/lib/use-pos-connection";
import { getLoginTime } from "@/lib/session-time";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard,
  ShoppingCart,
  Users,
  Package,
  BarChart,
  Settings,
  LogOut,
  ShieldAlert,
  Database,
  User as UserIcon,
  SlidersHorizontal,
  FileText,
  Zap,
  ShoppingBag,
  RotateCcw,
  Undo2,
  Briefcase,
  ArrowRightLeft,
  BookOpen,
  UserCircle,
  FolderKanban,
  CheckSquare,
  ShieldCheck,
  Sun,
  Moon,
  ChevronDown,
  LogOut as LogOutIcon,
  MonitorSmartphone,
  Warehouse,
  Truck,
  Hash,
  BarChart2,
  CalendarDays,
  Trash2,
  Wifi,
  Brain,
  CalendarRange,
  Banknote,
  Landmark,
  Percent,
  CalendarOff,
  ClipboardList,
  Building2,
  Gift,
  Receipt,
  Tag,
  ClipboardCheck,
  PercentSquare,
  CreditCard,
  Cpu,
  Printer,
  Upload,
} from "lucide-react";
import { OnlineUsersWidget } from "@/components/online-users-widget";
import { OnlineUsersButton } from "@/components/online-users-button";
import { NotificationBell } from "@/components/notification-bell";
import { AiKeyAlertBanner } from "@/components/ai-key-alert-banner";
import { useSessionHeartbeat } from "@/hooks/use-session-heartbeat";
import { useRealtimeSync } from "@/hooks/use-realtime-sync";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface AppLayoutProps {
  children: React.ReactNode;
}

function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const timeStr = now.toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const dateStr = now.toLocaleDateString("en-GH", { weekday: "short", year: "numeric", month: "short", day: "numeric" });
  return (
    <div className="flex flex-col items-end leading-tight select-none">
      <span className="text-sm font-semibold tabular-nums">{timeStr}</span>
      <span className="text-[11px] text-muted-foreground">{dateStr}</span>
    </div>
  );
}

type LiveState = "live" | "paused" | "offline";

function useOnlineLabel(username: string): { label: string; state: LiveState } {
  const [label, setLabel] = useState("");
  const [state, setState] = useState<LiveState>("live");

  useEffect(() => {
    const computeState = (): LiveState => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) return "offline";
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return "paused";
      return "live";
    };

    const update = () => {
      const ms = Date.now() - getLoginTime();
      const totalMins = Math.floor(ms / 60000);
      const hours = Math.floor(totalMins / 60);
      const mins = totalMins % 60;
      const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
      const next = computeState();
      setState(next);
      const prefix = next === "offline" ? "Offline" : next === "paused" ? "Paused" : "Live now";
      setLabel(`${prefix} – ${username}, ${timeStr} online`);
    };

    update();
    const id = setInterval(update, 30000);
    const onChange = () => update();
    window.addEventListener("online", onChange);
    window.addEventListener("offline", onChange);
    document.addEventListener("visibilitychange", onChange);
    return () => {
      clearInterval(id);
      window.removeEventListener("online", onChange);
      window.removeEventListener("offline", onChange);
      document.removeEventListener("visibilitychange", onChange);
    };
  }, [username]);

  return { label, state };
}

function EagleWatermark() {
  return (
    <svg className="eagle-watermark" viewBox="0 0 520 380" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <g fill="currentColor">
        <ellipse cx="260" cy="200" rx="38" ry="22" />
        <ellipse cx="284" cy="178" rx="14" ry="18" transform="rotate(-15 284 178)" />
        <ellipse cx="306" cy="158" rx="20" ry="18" />
        <path d="M324 152 Q342 155 336 164 Q328 162 322 158 Z" />
        <circle cx="310" cy="154" r="3.5" />
        <circle cx="311" cy="153" r="1.2" fill="white" />
        <path d="M258 196 Q220 170 170 140 Q130 118 60 108 Q80 126 110 136 Q140 146 160 150 Q130 152 90 155 Q50 158 10 162 Q50 170 95 168 Q130 166 155 162 Q125 172 95 184 Q65 196 30 206 Q70 208 108 200 Q138 193 160 185 Q148 200 135 215 Q122 230 110 245 Q132 238 150 225 Q168 212 178 200 Q172 216 168 234 Q164 252 162 270 Q178 256 188 238 Q198 220 200 200 Z" />
        <path d="M262 196 Q300 170 350 140 Q390 118 460 108 Q440 126 410 136 Q380 146 360 150 Q390 152 430 155 Q470 158 510 162 Q470 170 425 168 Q390 166 365 162 Q395 172 425 184 Q455 196 490 206 Q450 208 412 200 Q382 193 360 185 Q372 200 385 215 Q398 230 410 245 Q388 238 370 225 Q352 212 342 200 Q348 216 352 234 Q356 252 358 270 Q342 256 332 238 Q322 220 320 200 Z" />
        <path d="M248 218 Q244 240 238 260 Q248 248 256 256 Q260 270 260 285 Q264 270 264 256 Q272 248 282 260 Q276 240 272 218 Q266 228 260 225 Q254 228 248 218 Z" />
      </g>
    </svg>
  );
}

type NavItem = {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  permKey?: string;
  permDefault?: boolean;
  adminOnly?: boolean;
};
interface NavGroup { label: string; items: NavItem[]; iconColor: string; activeColor: string; }

interface PosDevice {
  id: string;
  name: string;
  deviceType: string;
  ip?: string;
  connectedAt: number;
  lastSeen: number;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { canAccess } = usePermissions();
  const [location] = useLocation();
  useSessionHeartbeat();
  useRealtimeSync();

  const isOnDashboard = location === "/dashboard";
  const { devices: posDevices } = usePosConnection(60000, !!user && !isOnDashboard);
  const posConnectedCount = posDevices.length;

  const filterItems = (items: NavItem[]) =>
    items.filter((item) => {
      if (item.adminOnly && user?.role !== "admin" && user?.role !== "manager") return false;
      return !item.permKey || canAccess(item.permKey, item.permDefault ?? true);
    });

  const buildNavGroups = (): NavGroup[] => {
    const groups: NavGroup[] = [
      {
        label: "General",
        items: [
          { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
          { title: "Quotations", href: "/quotations", icon: FileText, permKey: "perm_user_sales" },
        ],
        iconColor: "text-amber-400",
        activeColor: "data-[active=true]:bg-amber-500/20 data-[active=true]:text-amber-200",
      },
      {
        label: "Sales",
        items: [
          { title: "Sales", href: "/sales", icon: ShoppingCart, permKey: "perm_user_sales" },
          { title: "Point of Sale", href: "/pos", icon: MonitorSmartphone, permKey: "perm_user_pos" },
          { title: "Promotions", href: "/promotions", icon: Tag, permKey: "perm_user_sales" },
          { title: "Price Lists", href: "/price-lists", icon: PercentSquare, permKey: "perm_user_sales" },
          { title: "Sales Returns", href: "/sales-returns", icon: RotateCcw, permKey: "perm_user_sales" },
        ],
        iconColor: "text-emerald-400",
        activeColor: "data-[active=true]:bg-emerald-500/20 data-[active=true]:text-emerald-200",
      },
      {
        label: "Purchases",
        items: [
          { title: "Purchase Orders", href: "/purchases", icon: ShoppingBag, permKey: "perm_user_purchases" },
          { title: "Supplier Invoices", href: "/supplier-invoices", icon: FileText, permKey: "perm_user_purchases" },
          { title: "Reorder Rules", href: "/reorder-rules", icon: Zap, permKey: "perm_user_purchases" },
          { title: "Suppliers", href: "/suppliers", icon: Truck, permKey: "perm_user_purchases" },
          { title: "Purchase Returns", href: "/purchase-returns", icon: Undo2, permKey: "perm_user_purchases" },
        ],
        iconColor: "text-sky-400",
        activeColor: "data-[active=true]:bg-sky-500/20 data-[active=true]:text-sky-200",
      },
      {
        label: "Inventory",
        items: [
          { title: "Products", href: "/products", icon: Package, permKey: "perm_user_inventory" },
          { title: "Branches", href: "/branches", icon: Building2, permKey: "perm_user_inventory" },
          { title: "Warehouses", href: "/warehouses", icon: Warehouse, permKey: "perm_user_inventory" },
          { title: "Stock Take", href: "/stock-take", icon: ClipboardCheck, permKey: "perm_user_inventory" },
          { title: "Serial Numbers", href: "/serial-numbers", icon: Hash, permKey: "perm_user_inventory" },
          { title: "Adjustments", href: "/adjustments", icon: SlidersHorizontal, permKey: "perm_user_inventory" },
          { title: "Product Transfer", href: "/product-transfer", icon: ArrowRightLeft, permKey: "perm_user_inventory" },
          { title: "Import Portal", href: "/import-portal", icon: Upload, adminOnly: true },
        ],
        iconColor: "text-orange-400",
        activeColor: "data-[active=true]:bg-orange-500/20 data-[active=true]:text-orange-200",
      },
      {
        label: "CRM",
        items: [
          { title: "Customers", href: "/customers", icon: Users },
          { title: "People", href: "/people", icon: UserCircle },
          { title: "Loyalty Program", href: "/loyalty", icon: Gift },
          { title: "Customer Credits", href: "/customer-credits", icon: CreditCard, permKey: "perm_user_accounting" },
        ],
        iconColor: "text-pink-400",
        activeColor: "data-[active=true]:bg-pink-500/20 data-[active=true]:text-pink-200",
      },
      {
        label: "Operations",
        items: [
          { title: "HRM Hub", href: "/hrm", icon: Briefcase, permKey: "perm_user_hrm", permDefault: false },
          { title: "Projects", href: "/projects", icon: FolderKanban, permKey: "module_projects" },
          { title: "Tasks", href: "/tasks", icon: CheckSquare, permKey: "module_tasks" },
        ],
        iconColor: "text-violet-400",
        activeColor: "data-[active=true]:bg-violet-500/20 data-[active=true]:text-violet-200",
      },
      {
        label: "Finance",
        items: [
          { title: "Accounting & Audit", href: "/accounting", icon: BookOpen, permKey: "perm_user_accounting" },
          { title: "Expense Tracker", href: "/expenses", icon: Receipt, permKey: "perm_user_accounting" },
          { title: "Cash Management", href: "/cash-management", icon: Banknote, permKey: "perm_user_accounting" },
          { title: "Bank Reconciliation", href: "/bank-reconciliation", icon: Landmark, permKey: "perm_user_accounting" },
          { title: "VAT / Tax Report", href: "/vat-report", icon: Percent, permKey: "perm_user_reports" },
          { title: "Reports", href: "/reports", icon: BarChart, permKey: "perm_user_reports" },
          { title: "Analytics", href: "/analytics", icon: BarChart2, permKey: "perm_user_reports" },
          { title: "AI Insights", href: "/ai-insights", icon: Brain, permKey: "perm_user_reports" },
        ],
        iconColor: "text-cyan-400",
        activeColor: "data-[active=true]:bg-cyan-500/20 data-[active=true]:text-cyan-200",
      },
      {
        label: "Workforce",
        items: [
          { title: "Duty Roster", href: "/duty-roster", icon: CalendarDays, permKey: "perm_user_hrm", permDefault: false },
          { title: "Attendance", href: "/attendance", icon: ClipboardList, permKey: "perm_user_hrm", permDefault: false },
          { title: "Leave Management", href: "/leave", icon: CalendarOff, permKey: "perm_user_hrm", permDefault: false },
          { title: "Payroll", href: "/payroll", icon: Banknote, permKey: "perm_user_hrm", permDefault: false },
          { title: "Departments", href: "/departments", icon: Building2, permKey: "perm_user_hrm", permDefault: false },
        ],
        iconColor: "text-teal-400",
        activeColor: "data-[active=true]:bg-teal-500/20 data-[active=true]:text-teal-200",
      },
      {
        label: "Hardware",
        items: [
          { title: "ESL Dashboard", href: "/hardware/esl", icon: Cpu, permKey: "perm_user_inventory" },
          { title: "Label Printer", href: "/hardware/label-printer", icon: Printer, permKey: "perm_user_inventory" },
        ],
        iconColor: "text-fuchsia-400",
        activeColor: "data-[active=true]:bg-fuchsia-500/20 data-[active=true]:text-fuchsia-200",
      },
    ];

    return groups
      .map((g) => ({ ...g, items: filterItems(g.items) }))
      .filter((g) => g.items.length > 0);
  };

  const navGroups = buildNavGroups();

  const adminGroup: NavGroup = {
    label: "Administration",
    items: [
      { title: "Security Centre", href: "/admin/security", icon: ShieldCheck },
      { title: "Generated Reports", href: "/generated-reports", icon: CalendarRange },
      { title: "Admin Settings", href: "/admin/settings", icon: ShieldAlert },
      { title: "Audit Tray", href: "/admin/audit-logs", icon: ShieldAlert },
      { title: "Recycle Bin", href: "/admin/recycle-bin", icon: Trash2 },
      { title: "Backup", href: "/admin/backup", icon: Database },
    ],
    iconColor: "text-red-400",
    activeColor: "data-[active=true]:bg-red-500/20 data-[active=true]:text-red-200",
  };

  return (
    <SidebarProvider>
      <SidebarInner
        user={user}
        logout={logout}
        theme={theme}
        toggleTheme={toggleTheme}
        location={location}
        navGroups={navGroups}
        adminGroup={adminGroup}
        posConnectedCount={posConnectedCount}
        posDevices={posDevices}
      >
        {children}
      </SidebarInner>
    </SidebarProvider>
  );
}

interface SidebarInnerProps {
  user: ReturnType<typeof useAuth>["user"];
  logout: ReturnType<typeof useAuth>["logout"];
  theme: string;
  toggleTheme: () => void;
  location: string;
  navGroups: NavGroup[];
  adminGroup: NavGroup;
  posConnectedCount: number;
  posDevices: PosDevice[];
  children: React.ReactNode;
}

function SidebarInner({ user, logout, theme, toggleTheme, location, navGroups, adminGroup, posConnectedCount, posDevices, children }: SidebarInnerProps) {
  const { setOpen, setOpenMobile, isMobile } = useSidebar();
  const { label: onlineLabel, state: liveState } = useOnlineLabel(user?.name ?? "");

  const closeSidebar = () => {
    if (isMobile) {
      setOpenMobile(false);
    } else {
      setOpen(false);
    }
  };

  const prevLocation = useRef(location);
  useEffect(() => {
    if (prevLocation.current !== location) {
      prevLocation.current = location;
      setOpen(false);
      setOpenMobile(false);
    }
  }, [location, setOpen, setOpenMobile]);

  const renderGroup = ({ label, items, iconColor, activeColor }: NavGroup) => (
    <SidebarGroup key={label}>
      <SidebarGroupLabel className="text-white/70 text-[10px] uppercase tracking-widest font-semibold">
        {label}
      </SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => {
          const isActive = location === item.href || location.startsWith(item.href + "/");
          const isPosItem = item.href === "/pos";
          return (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                asChild
                isActive={isActive}
                className={`text-white/95 hover:text-white hover:bg-white/10 transition-colors ${activeColor}`}
              >
                <Link href={item.href} onClick={closeSidebar}>
                  <item.icon className={`h-4 w-4 flex-shrink-0 ${iconColor}`} />
                  <span className="flex-1">{item.title}</span>
                  {isPosItem && (
                    <span className="flex items-center gap-1 ml-auto">
                      <span
                        className={`h-2 w-2 rounded-full flex-shrink-0 ${posConnectedCount > 0 ? "bg-emerald-400" : "bg-white/20"}`}
                        style={posConnectedCount > 0 ? { animation: "posConnPulse 2s ease-in-out infinite" } : {}}
                      />
                      {posConnectedCount > 0 && (
                        <span className="text-[10px] font-bold text-emerald-400 tabular-nums">{posConnectedCount}</span>
                      )}
                    </span>
                  )}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );

  return (
    <div className="min-h-[100dvh] flex w-full bg-background">
      <style>{`
        @keyframes onlineBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes posConnPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.8); }
        }
      `}</style>

      <Sidebar className="border-r border-white/10 app-sidebar">
        <SidebarHeader className="p-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <img src="/logo.jpeg" alt="Infinity Techub Intelligence" className="h-9 w-auto object-contain flex-shrink-0 rounded" />
            <div className="flex flex-col leading-tight overflow-hidden">
              <span className="font-bold text-sm text-amber-300 truncate">Infinity Techub</span>
              <span className="text-[10px] text-white/60 truncate">Sales &amp; Inventory Management System</span>
            </div>
          </div>

          {/* POS Connection Status panel in sidebar */}
          <div className={`mt-2 flex items-center gap-2 px-2 py-1.5 rounded-lg border transition-colors ${posConnectedCount > 0 ? "bg-emerald-500/10 border-emerald-500/30" : "bg-white/5 border-white/10"}`}>
            <Wifi className={`h-3.5 w-3.5 flex-shrink-0 ${posConnectedCount > 0 ? "text-emerald-400" : "text-white/30"}`} />
            <div className="flex flex-col flex-1 min-w-0">
              <span className={`text-[10px] font-semibold leading-tight ${posConnectedCount > 0 ? "text-emerald-300" : "text-white/40"}`}>
                POS Connection
              </span>
              <span className={`text-[9px] leading-tight ${posConnectedCount > 0 ? "text-emerald-400/80" : "text-white/25"}`}>
                {posConnectedCount > 0
                  ? `${posConnectedCount} device${posConnectedCount !== 1 ? "s" : ""} connected`
                  : "No devices connected"}
              </span>
            </div>
            {posConnectedCount > 0 && (
              <span
                className="h-2 w-2 rounded-full bg-emerald-400 flex-shrink-0"
                style={{ animation: "posConnPulse 1.8s ease-in-out infinite" }}
              />
            )}
          </div>
        </SidebarHeader>

        <SidebarContent className="overflow-y-auto">
          {navGroups.map(renderGroup)}
          {user?.role === "admin" && renderGroup(adminGroup)}
        </SidebarContent>

        <OnlineUsersWidget />

        <SidebarFooter className="border-t border-white/10 p-2">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2 px-1.5 py-1 rounded-lg">
              <div className="h-7 w-7 rounded-full bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-300 font-bold text-xs flex-shrink-0">
                {user?.name?.charAt(0).toUpperCase() || <UserIcon className="h-3.5 w-3.5" />}
              </div>
              <div className="flex flex-col flex-1 overflow-hidden min-w-0">
                <span className="text-xs font-semibold text-white truncate">{user?.name}</span>
                <span className="text-[10px] text-white/70 truncate">{user?.email}</span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" className="flex-1 h-7 text-xs justify-start text-white/90 hover:text-white hover:bg-white/10 px-2 gap-1.5" asChild>
                <Link href="/settings">
                  <Settings className="h-3.5 w-3.5 text-slate-300" />Settings
                </Link>
              </Button>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/10 flex-shrink-0" onClick={logout} title="Sign Out">
                <LogOut className="h-3.5 w-3.5" />
              </Button>
            </div>
            <p className="text-[9px] text-white/50 text-center px-1 leading-tight">
              Powered by Infinity Techub Intelligence. All rights reserved (2026).
            </p>
          </div>
        </SidebarFooter>
      </Sidebar>

      <main className="flex-1 flex flex-col overflow-hidden relative app-main-content">
        <EagleWatermark />

        {/* ── Live status banner ── */}
        {user?.name && onlineLabel && (
          <div
            className={`flex items-center justify-center gap-2 px-4 py-1 border-b relative z-20 select-none ${
              liveState === "offline"
                ? "bg-[#7f1d1d] dark:bg-[#5c1414] border-[#991b1b]/60"
                : liveState === "paused"
                ? "bg-[#92400e] dark:bg-[#854d0e] border-[#b45309]/60"
                : "bg-[#4b5320] dark:bg-[#3d441b] border-[#5c6628]/60"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full flex-shrink-0 ${
                liveState === "offline"
                  ? "bg-[#fca5a5]"
                  : liveState === "paused"
                  ? "bg-[#fef08a]"
                  : "bg-[#bef264]"
              }`}
              style={{
                animation:
                  liveState === "live" ? "onlineBlink 1.1s ease-in-out infinite" : undefined,
              }}
            />
            <span className="text-[11px] font-semibold text-white tracking-wide truncate">
              {onlineLabel}
            </span>
          </div>
        )}

        <header className="h-14 border-b border-border/60 flex items-center justify-between px-2 sm:px-4 bg-background/80 backdrop-blur-sm sticky top-0 z-10 gap-2 sm:gap-4">
          <div className="flex items-center gap-2 min-w-0 flex-shrink">
            <SidebarTrigger />
            <span className="hidden md:block text-sm font-medium text-muted-foreground truncate">
              Infinity Sales &amp; Inventory
            </span>
          </div>

          <div className="flex items-center gap-1 sm:gap-2 md:gap-3 flex-shrink-0">
            <div className="hidden sm:block"><LiveClock /></div>


            <Button variant="ghost" size="icon" onClick={toggleTheme} title={theme === "dark" ? "Light mode" : "Dark mode"} className="h-9 w-9">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>

            {/* POS Connection Icon in header */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-9 w-9 relative ${posConnectedCount > 0 ? "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10" : "text-muted-foreground hover:text-foreground"}`}
                  title={posConnectedCount > 0 ? `${posConnectedCount} POS device(s) connected` : "POS Connection — no devices"}
                >
                  <MonitorSmartphone className="h-4 w-4" />
                  {/* Green/grey status dot */}
                  <span
                    className={`absolute bottom-1 right-1 h-2 w-2 rounded-full border-[1.5px] border-background ${posConnectedCount > 0 ? "bg-emerald-500" : "bg-slate-400"}`}
                    style={posConnectedCount > 0 ? { animation: "posConnPulse 1.8s ease-in-out infinite" } : {}}
                  />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <div className="px-3 py-2 font-medium text-sm flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Wifi className={`h-4 w-4 ${posConnectedCount > 0 ? "text-emerald-500" : "text-muted-foreground"}`} />
                    POS Devices
                  </span>
                  <Badge className={`text-xs border-0 ${posConnectedCount > 0 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>
                    {posConnectedCount} connected
                  </Badge>
                </div>
                <DropdownMenuSeparator />
                {posConnectedCount === 0 ? (
                  <div className="px-3 py-4 text-center space-y-1.5">
                    <p className="text-sm text-muted-foreground">No POS devices connected</p>
                    <p className="text-[11px] text-muted-foreground/70">
                      Devices connect via <code className="bg-muted px-1 py-0.5 rounded text-[10px]">POST /api/pos/connect</code>
                    </p>
                  </div>
                ) : (
                  <div className="max-h-60 overflow-y-auto">
                    {posDevices.map((device) => (
                      <div key={device.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-muted/50 transition-colors">
                        <div className="h-7 w-7 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center flex-shrink-0">
                          <MonitorSmartphone className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{device.name}</p>
                          <p className="text-xs text-muted-foreground capitalize">{device.deviceType.replace(/_/g, " ")}</p>
                        </div>
                        <span
                          className="h-2 w-2 rounded-full bg-emerald-500 flex-shrink-0"
                          style={{ animation: "posConnPulse 2s ease-in-out infinite" }}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Online Users (admin only) */}
            <OnlineUsersButton />

            {/* Live Notification Bell */}
            <NotificationBell />


            {/* Account Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-9 gap-2 px-2">
                  <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium text-xs flex-shrink-0">
                    {user?.name?.charAt(0).toUpperCase() || "U"}
                  </div>
                  <span className="hidden md:block text-sm max-w-[100px] truncate">{user?.name}</span>
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <div className="px-3 py-2">
                  <p className="text-sm font-medium truncate">{user?.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/settings" className="cursor-pointer">
                    <Settings className="mr-2 h-4 w-4" />Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/settings" className="cursor-pointer">
                    <ShieldCheck className="mr-2 h-4 w-4 text-primary" />Change Password
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive cursor-pointer">
                  <LogOutIcon className="mr-2 h-4 w-4" />Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <AiKeyAlertBanner />
        <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 relative z-10 bg-background/95">
          {children}
        </div>
      </main>
    </div>
  );
}
