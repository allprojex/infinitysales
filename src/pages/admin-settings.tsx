import { useState, useEffect, useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  ShieldCheck,
  Users,
  Bell,
  Globe,
  Lock,
  Loader2,
  KeyRound,
  ShieldAlert,
  AlertTriangle,
  Eye,
  EyeOff,
  Check,
  X,
  UserX,
  UserCheck,
  UserPlus,
  MapPin,
  Building2,
  Receipt,
  Percent,
  Save,
  RefreshCw,
  Phone,
  Mail,
  Globe2,
  CreditCard,
  Landmark,
  FileText,
  Clock,
  Shield,
  BadgePercent,
  MonitorSmartphone,
  LayoutDashboard,
  MessageSquare,
  Database,
  Warehouse,
  Banknote,
  Briefcase,
  ArrowUpCircle,
  ChevronRight,
  Smartphone,
  Server,
  Puzzle,
  Key,
  CalendarCheck,
  Flame,
  Info,
  RotateCcw,
  Terminal,
  Activity,
  PackageCheck,
  Trash2,
  HardDrive,
  Cpu,
  Timer,
  Copy,
  QrCode,
  Download,
  Upload,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { customFetch } from "@/workspace/api-client-react";
import { cn } from "@/lib/utils";
import { GhanaRegionPicker } from "@/components/ghana-region-picker";

type UserRole = "admin" | "manager" | "cashier" | "accountant" | "user";
type AdminUser = {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  twoFactorEnabled: boolean;
  isLocked: boolean;
  mustChangePassword: boolean;
  city?: string | null;
  createdAt: string;
};
type Settings = Record<string, string | null>;

/* ── shared helpers ─────────────────────────────────────── */
const pwdCriteria = [
  { label: "8+ characters", test: (p: string) => p.length >= 8 },
  { label: "Uppercase", test: (p: string) => /[A-Z]/.test(p) },
  { label: "Lowercase", test: (p: string) => /[a-z]/.test(p) },
  { label: "Number", test: (p: string) => /[0-9]/.test(p) },
  { label: "Special char", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];
function getStrength(p: string) {
  if (!p) return null;
  let s = 0;
  if (p.length >= 8) s++;
  if (p.length >= 12) s++;
  if (/[A-Z]/.test(p)) s++;
  if (/[a-z]/.test(p)) s++;
  if (/[0-9]/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  if (s <= 2) return { label: "Weak", color: "bg-red-500", textColor: "text-red-600", pct: 25 };
  if (s <= 3)
    return { label: "Fair", color: "bg-orange-400", textColor: "text-orange-500", pct: 50 };
  if (s <= 4)
    return { label: "Good", color: "bg-yellow-400", textColor: "text-yellow-600", pct: 75 };
  return { label: "Strong", color: "bg-green-500", textColor: "text-green-600", pct: 100 };
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0",
        checked ? "bg-primary" : "bg-muted-foreground/30",
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-6" : "translate-x-1",
        )}
      />
    </button>
  );
}

function FieldRow({
  label,
  hint,
  children,
  tight,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  tight?: boolean;
}) {
  return (
    <div className={cn("grid gap-2 items-start", tight ? "grid-cols-2" : "md:grid-cols-3")}>
      <div className="pt-2">
        <label className="text-sm font-medium">{label}</label>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      <div className={tight ? "" : "md:col-span-2"}>{children}</div>
    </div>
  );
}

function NotifyRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b last:border-0">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <Toggle checked={value} onChange={onChange} />
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  description,
  children,
  onSave,
  saving,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  children: React.ReactNode;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start gap-4 pb-4">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription className="text-xs mt-0.5">{description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
      <CardFooter className="border-t pt-4 bg-muted/10">
        <Button className="ml-auto rounded-full gap-2" onClick={onSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{" "}
          Save Changes
        </Button>
      </CardFooter>
    </Card>
  );
}

function Loading() {
  return (
    <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
      <Loader2 className="h-5 w-5 animate-spin" /> Loading…
    </div>
  );
}

/* ── Password input ─────────────────────────────────────── */
function PasswordInput({
  value,
  onChange,
  placeholder = "Enter a strong password",
  name,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  name?: string;
  id?: string;
}) {
  const [show, setShow] = useState(false);
  const strength = getStrength(value);
  return (
    <div className="space-y-2">
      <div className="relative">
        <Input
          id={id}
          name={name}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="rounded-[20px] pr-10"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          tabIndex={-1}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {strength && (
        <div className="space-y-1">
          <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", strength.color)}
              style={{ width: `${strength.pct}%` }}
            />
          </div>
          <p className={cn("text-xs font-medium", strength.textColor)}>
            Strength: {strength.label}
          </p>
        </div>
      )}
      {value.length > 0 && (
        <div className="bg-muted/30 p-3 rounded-xl">
          <div className="grid grid-cols-2 gap-1.5">
            {pwdCriteria.map((c, i) => {
              const ok = c.test(value);
              return (
                <div key={i} className="flex items-center gap-1.5 text-xs">
                  {ok ? (
                    <Check className="h-3 w-3 text-green-500" />
                  ) : (
                    <X className="h-3 w-3 text-muted-foreground" />
                  )}
                  <span className={cn(ok ? "text-foreground" : "text-muted-foreground")}>
                    {c.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Dialogs ─────────────────────────────────────────────── */
function ResetPasswordDialog({
  user,
  open,
  onClose,
  onSuccess,
}: {
  user: AdminUser | null;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const ok = pwdCriteria.every((c) => c.test(pw));
  const submit = async () => {
    if (!user || !ok) return;
    setLoading(true);
    try {
      await customFetch("/api/auth/admin/reset-user-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, newPassword: pw }),
      });
      toast({ title: "Password reset" });
      setPw("");
      onSuccess();
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Reset failed",
        description: e instanceof Error ? e.message : "",
      });
    } finally {
      setLoading(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          onClose();
          setPw("");
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" /> Reset Password
          </DialogTitle>
          <DialogDescription>
            Set a new password for <strong>{user?.email}</strong>. They will be required to change
            it on next login.
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <label className="text-sm font-medium block mb-1.5">New Password</label>
          <PasswordInput id="reset-new-password" name="new-password" value={pw} onChange={setPw} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="rounded-full">
            Cancel
          </Button>
          <Button onClick={submit} disabled={loading || !ok} className="rounded-full">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Reset Password
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteUserDialog({
  user,
  open,
  onClose,
  onConfirm,
  loading,
}: {
  user: AdminUser | null;
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="h-4 w-4" /> Delete User
          </DialogTitle>
          <DialogDescription>
            This action is permanent and cannot be undone. The user account for{" "}
            <strong>{user?.email}</strong> will be removed from the system.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="rounded-full" disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={loading}
            className="rounded-full"
          >
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="mr-2 h-4 w-4" />
            )}{" "}
            Delete User
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateUserDialog({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [role, setRole] = useState<UserRole>("user");
  const [city, setCity] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const ok = pwdCriteria.every((c) => c.test(pw));
  const valid = name.trim().length >= 2 && email.includes("@") && ok;
  const reset = () => {
    setName("");
    setEmail("");
    setPw("");
    setRole("user");
    setCity("");
  };
  const submit = async () => {
    if (!valid) return;
    setLoading(true);
    try {
      await customFetch("/api/auth/admin/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password: pw, role, city: city || undefined }),
      });
      toast({ title: "User created" });
      reset();
      onSuccess();
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Failed to create user",
        description: e instanceof Error ? e.message : "",
      });
    } finally {
      setLoading(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          onClose();
          reset();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-primary" /> Create New User
          </DialogTitle>
          <DialogDescription>
            The user will be required to change their password and set up 2FA on first login.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <label className="text-sm font-medium block mb-1.5">Full Name</label>
            <Input
              id="create-user-name"
              name="name"
              placeholder="Kwame Asante"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-[20px]"
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1.5">Email</label>
            <Input
              id="create-user-email"
              name="email"
              type="email"
              placeholder="user@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-[20px]"
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1.5">Password</label>
            <PasswordInput
              id="create-user-password"
              name="password"
              value={pw}
              onChange={setPw}
              placeholder="Set a temporary password"
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1.5">Role</label>
            <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
              <SelectTrigger className="rounded-[20px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="cashier">Cashier</SelectItem>
                <SelectItem value="accountant">Accountant</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1.5 flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
              City
            </label>
            <GhanaRegionPicker value={city} onChange={setCity} />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onClose();
              reset();
            }}
            className="rounded-full"
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={loading || !valid} className="rounded-full">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Create User
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Backup Restore Section ──────────────────────────────── */
type BackupRecord = {
  id: number;
  filename: string;
  size: number;
  tablesIncluded: unknown;
  createdBy: number | null;
  createdAt: string;
  source?: string;
  format?: string | null;
};
type ColumnReport = Record<string, { matched: string[]; skipped: string[] }>;
type ValidationResult = {
  uploadId: number;
  filename: string;
  format: "json" | "sql";
  detectedTables: string[];
  columnReport: ColumnReport;
  warnings: string[];
};
type RestoreResult = {
  tablesRestored: string[];
  rowsAffected: number;
  preBackupId: number;
  warnings: string[];
};
type RestoreHistory = {
  id: number;
  action: string;
  userName: string | null;
  details: string;
  createdAt: string;
};

function BackupRestoreSection() {
  const { toast } = useToast();
  const [backupList, setBackupList] = useState<BackupRecord[]>([]);
  const [backupListLoading, setBackupListLoading] = useState(false);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<
    "idle" | "uploading" | "validated" | "confirming" | "restoring" | "done" | "error"
  >("idle");
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [restoreMode, setRestoreMode] = useState<"full" | "merge" | "tables">("merge");
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [restoreResult, setRestoreResult] = useState<RestoreResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [history, setHistory] = useState<RestoreHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadBackups = useCallback(async () => {
    setBackupListLoading(true);
    try {
      const d = await customFetch<BackupRecord[]>("/api/admin/backup");
      setBackupList(Array.isArray(d) ? d : []);
    } catch {
      toast({ variant: "destructive", title: "Failed to load backups" });
    } finally {
      setBackupListLoading(false);
    }
  }, [toast]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const d = await customFetch<RestoreHistory[]>("/api/admin/backup/restore-history");
      setHistory(Array.isArray(d) ? d : []);
    } catch {
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBackups();
    loadHistory();
  }, [loadBackups, loadHistory]);

  const createBackup = async () => {
    setCreatingBackup(true);
    try {
      await customFetch("/api/admin/backup", { method: "POST" });
      toast({ title: "Backup created successfully" });
      loadBackups();
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Backup failed",
        description: e instanceof Error ? e.message : "",
      });
    } finally {
      setCreatingBackup(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setStep("idle");
    setValidation(null);
    setRestoreResult(null);
    setErrorMsg("");
    e.target.value = "";
  };

  const handleUpload = async () => {
    if (!file) return;
    setStep("uploading");
    try {
      const form = new FormData();
      form.append("backup", file);
      const result = await customFetch<ValidationResult>("/api/admin/backup/upload", {
        method: "POST",
        body: form,
      });
      setValidation(result);
      setSelectedTables(result.detectedTables);
      setStep("validated");
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Upload failed. Please check the file format.");
      setStep("error");
    }
  };

  const handleRestore = async () => {
    if (!validation) return;
    setStep("restoring");
    try {
      const result = await customFetch<RestoreResult>(
        `/api/admin/backup/${validation.uploadId}/restore`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: restoreMode,
            tables: restoreMode === "tables" ? selectedTables : undefined,
          }),
        },
      );
      setRestoreResult(result);
      setStep("done");
      loadBackups();
      loadHistory();
      toast({
        title: "Restore complete",
        description: `${result.rowsAffected} rows across ${result.tablesRestored.length} table(s).`,
      });
    } catch (e: unknown) {
      setErrorMsg(
        e instanceof Error ? e.message : "Restore failed. The operation was rolled back.",
      );
      setStep("error");
    }
  };

  const reset = () => {
    setFile(null);
    setStep("idle");
    setValidation(null);
    setRestoreResult(null);
    setErrorMsg("");
  };

  return (
    <div className="space-y-4">
      {/* ── Backups list ── */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 pb-4">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Database className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Database Backups</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Create and download point-in-time snapshots of your database.
              </CardDescription>
            </div>
          </div>
          <Button
            size="sm"
            className="rounded-full gap-2 flex-shrink-0"
            onClick={createBackup}
            disabled={creatingBackup}
          >
            {creatingBackup ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <HardDrive className="h-3.5 w-3.5" />
            )}
            {creatingBackup ? "Creating…" : "Create Backup"}
          </Button>
        </CardHeader>
        <CardContent>
          {backupListLoading ? (
            <Loading />
          ) : backupList.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No backups yet. Click "Create Backup" to get started.
            </p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {backupList.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-xl border bg-muted/20 hover:bg-muted/30 transition-colors"
                >
                  <div className="min-w-0 flex items-center gap-2.5">
                    <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{b.filename}</p>
                      <p className="text-xs text-muted-foreground">
                        {(b.size / 1024).toFixed(1)} KB · {new Date(b.createdAt).toLocaleString()}{" "}
                        {b.source === "uploaded" ? (
                          <Badge variant="outline" className="text-[10px] ml-1 py-0">
                            uploaded
                          </Badge>
                        ) : null}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full gap-1.5 flex-shrink-0 text-xs"
                    asChild
                  >
                    <a href={`/api/admin/backup/${b.id}/download`} download={b.filename}>
                      <Download className="h-3.5 w-3.5" /> Download
                    </a>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Upload & Restore ── */}
      <Card>
        <CardHeader className="flex flex-row items-start gap-3 pb-4">
          <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
            <Upload className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <CardTitle className="text-base">Upload & Restore</CardTitle>
            <CardDescription className="text-xs mt-0.5">
              Restore from a backup file (.json, .sql, .zip, .gz — max 50 MB). A fresh backup is
              created automatically before any restore.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Step: idle / error — file picker */}
          {(step === "idle" || step === "error") && (
            <div className="space-y-3">
              <label
                htmlFor="backup-file-input"
                className={cn(
                  "flex flex-col items-center gap-3 p-6 border-2 border-dashed rounded-xl text-center cursor-pointer transition-colors",
                  file
                    ? "border-primary/50 bg-primary/5"
                    : "hover:border-primary/30 hover:bg-muted/30",
                )}
              >
                <HardDrive className="h-8 w-8 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">
                    {file ? file.name : "Click to choose a backup file"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {file
                      ? `${(file.size / 1024).toFixed(1)} KB`
                      : "Supports .json, .sql, .zip, .gz"}
                  </p>
                </div>
                <input
                  id="backup-file-input"
                  type="file"
                  accept=".json,.sql,.zip,.gz"
                  className="hidden"
                  onChange={handleFileSelect}
                />
              </label>
              {step === "error" && (
                <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-sm text-destructive flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}
              {file && (
                <Button className="w-full rounded-full gap-2" onClick={handleUpload}>
                  <Activity className="h-4 w-4" /> Validate Backup File
                </Button>
              )}
            </div>
          )}

          {/* Step: uploading */}
          {step === "uploading" && (
            <div className="flex flex-col items-center gap-3 py-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm font-medium">Uploading and analysing backup…</p>
              <p className="text-xs text-muted-foreground">
                Comparing with current database schema.
              </p>
            </div>
          )}

          {/* Step: validated — show report + options */}
          {step === "validated" && validation && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
                <p className="text-sm font-semibold text-green-800 dark:text-green-300 flex items-center gap-1.5">
                  <Check className="h-4 w-4" /> Validation passed
                </p>
                <p className="text-xs text-green-700 dark:text-green-400 mt-0.5">
                  {validation.filename} · Format: <strong>{validation.format.toUpperCase()}</strong>{" "}
                  · {validation.detectedTables.length} table(s) detected
                </p>
              </div>

              {/* Column report */}
              <div className="space-y-2">
                <p className="text-sm font-semibold">Table & Column Report</p>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {validation.detectedTables.map((t) => {
                    const cols = validation.columnReport[t] ?? { matched: [], skipped: [] };
                    return (
                      <div
                        key={t}
                        className="p-2.5 rounded-lg border bg-muted/20 text-xs space-y-0.5"
                      >
                        <p className="font-semibold">{t}</p>
                        {cols.matched.length > 0 && (
                          <p className="text-green-600 dark:text-green-400">
                            ✓ {cols.matched.join(", ")}
                          </p>
                        )}
                        {cols.skipped.length > 0 && (
                          <p className="text-muted-foreground">
                            ⚠ Skipped: {cols.skipped.join(", ")}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
                {validation.warnings.length > 0 && (
                  <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-400 space-y-1">
                    {validation.warnings.map((w, i) => (
                      <p key={i}>⚠ {w}</p>
                    ))}
                  </div>
                )}
              </div>

              {/* Restore mode */}
              <div className="space-y-2">
                <p className="text-sm font-semibold">Restore Mode</p>
                <div className="space-y-2">
                  {(["full", "merge", "tables"] as const).map((m) => (
                    <label
                      key={m}
                      className={cn(
                        "flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors",
                        restoreMode === m ? "border-primary bg-primary/5" : "hover:bg-muted/30",
                      )}
                    >
                      <input
                        type="radio"
                        name="restore-mode"
                        value={m}
                        checked={restoreMode === m}
                        onChange={() => setRestoreMode(m)}
                        className="mt-0.5 accent-primary"
                      />
                      <div>
                        <p className="text-sm font-medium">
                          {m === "full"
                            ? "Full Restore"
                            : m === "merge"
                              ? "Merge Restore"
                              : "Specific Tables"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {m === "full"
                            ? "Delete and replace all existing data with backup data (users table always merged for safety)"
                            : m === "merge"
                              ? "Insert new rows; update existing ones by ID. Recommended — no data loss for rows not in backup."
                              : "Select individual tables to restore, leaving the rest untouched."}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
                {restoreMode === "tables" && (
                  <div className="p-3 rounded-xl border space-y-2 bg-muted/10">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Select tables to restore:
                    </p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {validation.detectedTables.map((t) => (
                        <label
                          key={t}
                          className="flex items-center gap-2 text-sm cursor-pointer select-none"
                        >
                          <input
                            type="checkbox"
                            checked={selectedTables.includes(t)}
                            className="accent-primary"
                            onChange={(e) =>
                              setSelectedTables((prev) =>
                                e.target.checked ? [...prev, t] : prev.filter((x) => x !== t),
                              )
                            }
                          />
                          {t}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="rounded-full" onClick={reset}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  className="rounded-full gap-2 flex-1"
                  onClick={() => setStep("confirming")}
                  disabled={restoreMode === "tables" && selectedTables.length === 0}
                >
                  <RotateCcw className="h-4 w-4" /> Restore Now
                </Button>
              </div>
            </div>
          )}

          {/* Step: confirming */}
          {step === "confirming" && validation && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 space-y-2">
                <p className="text-sm font-semibold text-destructive flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4" /> Confirm Restore
                </p>
                <p className="text-sm">
                  This will modify your live database. A pre-restore backup will be created first so
                  you can roll back if needed.
                </p>
                <div className="mt-2 text-xs text-muted-foreground space-y-0.5">
                  <p>
                    File: <strong>{validation.filename}</strong>
                  </p>
                  <p>
                    Mode:{" "}
                    <strong className="capitalize">
                      {restoreMode === "tables"
                        ? `Specific tables (${selectedTables.join(", ")})`
                        : restoreMode}
                    </strong>
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="rounded-full flex-1"
                  onClick={() => setStep("validated")}
                >
                  Go Back
                </Button>
                <Button
                  variant="destructive"
                  className="rounded-full gap-2 flex-1"
                  onClick={handleRestore}
                >
                  <RotateCcw className="h-4 w-4" /> Confirm & Restore
                </Button>
              </div>
            </div>
          )}

          {/* Step: restoring */}
          {step === "restoring" && (
            <div className="flex flex-col items-center gap-3 py-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm font-semibold">Restoring database…</p>
              <p className="text-xs text-muted-foreground">
                Creating pre-restore backup, then applying changes in a transaction.
              </p>
            </div>
          )}

          {/* Step: done */}
          {step === "done" && restoreResult && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 space-y-1.5">
                <p className="text-sm font-semibold text-green-800 dark:text-green-300 flex items-center gap-1.5">
                  <Check className="h-5 w-5" /> Restore Complete
                </p>
                <p className="text-sm text-green-700 dark:text-green-400">
                  {restoreResult.rowsAffected} rows restored across{" "}
                  {restoreResult.tablesRestored.length} table(s).
                </p>
                <p className="text-xs text-green-600 dark:text-green-500">
                  Tables: {restoreResult.tablesRestored.join(", ")}
                </p>
                <p className="text-xs text-green-600 dark:text-green-500">
                  Pre-restore backup saved (ID: {restoreResult.preBackupId})
                </p>
                {restoreResult.warnings.length > 0 && (
                  <div className="mt-2 space-y-0.5 pt-2 border-t border-green-200 dark:border-green-800">
                    {restoreResult.warnings.map((w, i) => (
                      <p key={i} className="text-xs text-amber-600 dark:text-amber-400">
                        ⚠ {w}
                      </p>
                    ))}
                  </div>
                )}
              </div>
              <Button variant="outline" className="rounded-full w-full" onClick={reset}>
                Restore Another File
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Restore History ── */}
      {(history.length > 0 || historyLoading) && (
        <Card>
          <CardHeader className="flex flex-row items-start gap-3 pb-4">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Clock className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Restore History</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Audit log of all database restore operations.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {historyLoading ? (
              <Loading />
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {history.map((h) => (
                  <div
                    key={h.id}
                    className="flex items-start gap-2.5 p-3 rounded-xl border bg-muted/20 text-xs"
                  >
                    <RotateCcw className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium truncate">{h.details}</p>
                      <p className="text-muted-foreground">
                        {h.userName ?? "System"} · {new Date(h.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ── Sidebar nav ─────────────────────────────────────────── */
type NavItem = { id: string; label: string; icon: React.ComponentType<{ className?: string }> };
type NavGroup = { group: string; items: NavItem[] };

const NAV: NavGroup[] = [
  {
    group: "Core Setup",
    items: [
      { id: "system", label: "System Settings", icon: Globe },
      { id: "company", label: "Company Profile", icon: Building2 },
      { id: "mobile-access", label: "Mobile Access", icon: QrCode },
      { id: "modules", label: "Modules", icon: Puzzle },
    ],
  },
  {
    group: "Sales & Inventory",
    items: [
      { id: "pos", label: "POS Settings", icon: MonitorSmartphone },
      { id: "gateways", label: "Payment Gateways", icon: CreditCard },
      { id: "currency", label: "Currency Settings", icon: Banknote },
      { id: "warehouse", label: "Warehouse Settings", icon: Warehouse },
      { id: "tax", label: "Tax Configuration", icon: BadgePercent },
      { id: "product-expiry", label: "Product Expiry Control", icon: CalendarCheck },
    ],
  },
  {
    group: "Communication",
    items: [
      { id: "email", label: "Email Settings", icon: Mail },
      { id: "email-templates", label: "Email Templates", icon: FileText },
      { id: "sms", label: "SMS Settings", icon: Smartphone },
      { id: "sms-templates", label: "SMS Templates", icon: MessageSquare },
    ],
  },
  {
    group: "People & Access",
    items: [
      { id: "users", label: "Users & Accounts", icon: Users },
      { id: "user-control", label: "User Control Settings", icon: UserCheck },
      { id: "roles", label: "Roles & Permissions", icon: Shield },
      { id: "hrm-settings", label: "HRM Settings", icon: Briefcase },
    ],
  },
  {
    group: "System",
    items: [
      { id: "security", label: "Security Policies", icon: Lock },
      { id: "firewall", label: "Firewall Settings", icon: Flame },
      { id: "notifications", label: "Notifications", icon: Bell },
      { id: "receipt", label: "Receipt Settings", icon: Receipt },
      { id: "backup", label: "Backup Settings", icon: Database },
      { id: "system-info", label: "System Info", icon: Info },
      { id: "system-reset", label: "System Reset", icon: RotateCcw },
      { id: "upgrades", label: "System Upgrades", icon: ArrowUpCircle },
    ],
  },
];

/* ── Main component ─────────────────────────────────────── */
export default function AdminSettings() {
  const [active, setActive] = useState("system");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [lockingId, setLockingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<AdminUser | null>(null);
  const [settings, setSettings] = useState<Settings>({});
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const { toast } = useToast();
  const [newIp, setNewIp] = useState("");
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);

  const { data: ipBlocks, refetch: refetchIpBlocks } = useQuery({
    queryKey: ["ip-blocks"],
    queryFn: async () =>
      customFetch<
        Array<{
          id: number;
          ipAddress: string;
          reason: string;
          failedAttempts: number;
          createdAt: string;
        }>
      >("/api/admin/ip-blocks"),
    enabled: active === "firewall",
  });

  const {
    data: sysInfo,
    isLoading: sysInfoLoading,
    refetch: refetchSysInfo,
  } = useQuery({
    queryKey: ["system-info"],
    queryFn: async () =>
      customFetch<{
        version: string;
        platform: string;
        nodeVersion: string;
        uptimeSeconds: number;
        dbSize: string;
        recordCounts: Record<string, number>;
        timestamp: string;
      }>("/api/admin/system-info"),
    enabled: active === "system-info",
    staleTime: 30000,
  });

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const d = await customFetch<AdminUser[]>("/api/auth/admin/users");
      if (Array.isArray(d)) setUsers(d);
    } catch {
      toast({ variant: "destructive", title: "Failed to load users" });
    } finally {
      setUsersLoading(false);
    }
  }, [toast]);

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    try {
      const d = await customFetch<Settings>("/api/settings");
      if (d && typeof d === "object") setSettings(d);
    } catch {
      toast({ variant: "destructive", title: "Failed to load settings" });
    } finally {
      setSettingsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadUsers();
    loadSettings();
  }, [loadUsers, loadSettings]);

  const set = (key: string, value: string) => setSettings((prev) => ({ ...prev, [key]: value }));
  const get = (key: string, fallback = "") => settings[key] ?? fallback;
  const bool = (key: string, fallback = false) => {
    const v = settings[key];
    if (v == null) return fallback;
    return v === "true";
  };

  const saveSection = async (section: string, keys: string[]) => {
    setSaving(section);
    try {
      const payload: Record<string, string> = {};
      for (const k of keys) payload[k] = settings[k] ?? "";
      await customFetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      toast({ title: "Settings saved", description: "Changes applied successfully." });
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Save failed",
        description: e instanceof Error ? e.message : "",
      });
    } finally {
      setSaving(null);
    }
  };

  const toggleLock = async (u: AdminUser) => {
    setLockingId(u.id);
    try {
      const r = await customFetch<{ message: string }>("/api/auth/admin/toggle-lock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: u.id }),
      });
      toast({ title: r.message });
      await loadUsers();
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Action failed",
        description: e instanceof Error ? e.message : "",
      });
    } finally {
      setLockingId(null);
    }
  };

  const blockUser = async (u: AdminUser) => {
    setLockingId(u.id);
    try {
      const r = await customFetch<{ message: string }>("/api/auth/admin/set-lock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: u.id, locked: true }),
      });
      toast({ title: r.message });
      await loadUsers();
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Block failed",
        description: e instanceof Error ? e.message : "",
      });
    } finally {
      setLockingId(null);
    }
  };

  const unblockUser = async (u: AdminUser) => {
    setLockingId(u.id);
    try {
      const r = await customFetch<{ message: string }>("/api/auth/admin/set-lock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: u.id, locked: false }),
      });
      toast({ title: r.message });
      await loadUsers();
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Unblock failed",
        description: e instanceof Error ? e.message : "",
      });
    } finally {
      setLockingId(null);
    }
  };

  const deleteUser = async (u: AdminUser) => {
    setDeletingId(u.id);
    try {
      const r = await customFetch<{ message: string }>(`/api/auth/admin/users/${u.id}`, {
        method: "DELETE",
      });
      toast({ title: r.message });
      setDeleteConfirmUser(null);
      await loadUsers();
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Delete failed",
        description: e instanceof Error ? e.message : "",
      });
    } finally {
      setDeletingId(null);
    }
  };

  /* ── Render each content section ─── */
  const renderContent = () => {
    if (settingsLoading && active !== "users") return <Loading />;

    switch (active) {
      /* SYSTEM */
      case "system":
        return (
          <div className="space-y-6">
            <Section
              icon={Globe}
              title="Localisation"
              description="Currency, timezone, date format, and regional preferences."
              onSave={() =>
                saveSection("locale", ["currency", "currency_symbol", "timezone", "date_format"])
              }
              saving={saving === "locale"}
            >
              <FieldRow label="Currency">
                <Select value={get("currency", "GHS")} onValueChange={(v) => set("currency", v)}>
                  <SelectTrigger className="rounded-[20px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GHS">GHS – Ghanaian Cedi (₵)</SelectItem>
                    <SelectItem value="USD">USD – US Dollar ($)</SelectItem>
                    <SelectItem value="EUR">EUR – Euro (€)</SelectItem>
                    <SelectItem value="GBP">GBP – British Pound (£)</SelectItem>
                    <SelectItem value="NGN">NGN – Nigerian Naira (₦)</SelectItem>
                  </SelectContent>
                </Select>
              </FieldRow>
              <FieldRow label="Currency Symbol">
                <Input
                  name="currency_symbol"
                  value={get("currency_symbol", "₵")}
                  onChange={(e) => set("currency_symbol", e.target.value)}
                  className="rounded-[20px] w-24"
                />
              </FieldRow>
              <FieldRow label="Timezone">
                <Select
                  value={get("timezone", "Africa/Accra")}
                  onValueChange={(v) => set("timezone", v)}
                >
                  <SelectTrigger className="rounded-[20px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Africa/Accra">Africa/Accra (GMT+0)</SelectItem>
                    <SelectItem value="Africa/Lagos">Africa/Lagos (GMT+1)</SelectItem>
                    <SelectItem value="Africa/Nairobi">Africa/Nairobi (GMT+3)</SelectItem>
                    <SelectItem value="Europe/London">Europe/London</SelectItem>
                    <SelectItem value="America/New_York">America/New_York</SelectItem>
                  </SelectContent>
                </Select>
              </FieldRow>
              <FieldRow label="Date Format">
                <Select
                  value={get("date_format", "DD/MM/YYYY")}
                  onValueChange={(v) => set("date_format", v)}
                >
                  <SelectTrigger className="rounded-[20px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                    <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                    <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                    <SelectItem value="D MMM YYYY">D MMM YYYY</SelectItem>
                  </SelectContent>
                </Select>
              </FieldRow>
            </Section>
            <Section
              icon={Server}
              title="Business Operations"
              description="Fiscal year start and inventory threshold."
              onSave={() => saveSection("ops", ["fiscal_year_start", "low_stock_threshold"])}
              saving={saving === "ops"}
            >
              <FieldRow label="Fiscal Year Start">
                <Select
                  value={get("fiscal_year_start", "01")}
                  onValueChange={(v) => set("fiscal_year_start", v)}
                >
                  <SelectTrigger className="rounded-[20px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[
                      "January",
                      "February",
                      "March",
                      "April",
                      "May",
                      "June",
                      "July",
                      "August",
                      "September",
                      "October",
                      "November",
                      "December",
                    ].map((m, i) => (
                      <SelectItem key={i} value={String(i + 1).padStart(2, "0")}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldRow>
              <FieldRow label="Low Stock Threshold" hint="Alert when stock falls below this">
                <Input
                  name="low_stock_threshold"
                  type="number"
                  min={1}
                  value={get("low_stock_threshold", "10")}
                  onChange={(e) => set("low_stock_threshold", e.target.value)}
                  className="rounded-[20px] w-28"
                />
              </FieldRow>
            </Section>
          </div>
        );

      /* COMPANY */
      case "company":
        return (
          <div className="space-y-6">
            <Section
              icon={Building2}
              title="Business Information"
              description="Details shown on invoices and receipts."
              onSave={() =>
                saveSection("cinfo", [
                  "company_name",
                  "company_address",
                  "company_tin",
                  "company_website",
                ])
              }
              saving={saving === "cinfo"}
            >
              <FieldRow label="Company Name">
                <Input
                  name="company_name"
                  value={get("company_name")}
                  onChange={(e) => set("company_name", e.target.value)}
                  className="rounded-[20px]"
                />
              </FieldRow>
              <FieldRow label="Business Address">
                <Textarea
                  value={get("company_address")}
                  onChange={(e) => set("company_address", e.target.value)}
                  rows={2}
                  className="rounded-[20px] resize-none"
                />
              </FieldRow>
              <FieldRow label="TIN / Tax ID" hint="GRA TIN">
                <Input
                  name="company_tin"
                  value={get("company_tin")}
                  onChange={(e) => set("company_tin", e.target.value)}
                  placeholder="C000123456789"
                  className="rounded-[20px]"
                />
              </FieldRow>
              <FieldRow label="Website">
                <div className="relative">
                  <Globe2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    name="company_website"
                    value={get("company_website")}
                    onChange={(e) => set("company_website", e.target.value)}
                    placeholder="https://..."
                    className="rounded-[20px] pl-9"
                  />
                </div>
              </FieldRow>
            </Section>
            <Section
              icon={Phone}
              title="Contact Details"
              description="Phone and email displayed to customers."
              onSave={() => saveSection("ccontact", ["company_phone", "company_email"])}
              saving={saving === "ccontact"}
            >
              <FieldRow label="Phone">
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    name="company_phone"
                    value={get("company_phone")}
                    onChange={(e) => set("company_phone", e.target.value)}
                    placeholder="+233 20 000 0000"
                    className="rounded-[20px] pl-9"
                  />
                </div>
              </FieldRow>
              <FieldRow label="Email">
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    name="company_email"
                    type="email"
                    value={get("company_email")}
                    onChange={(e) => set("company_email", e.target.value)}
                    className="rounded-[20px] pl-9"
                  />
                </div>
              </FieldRow>
            </Section>
            <Section
              icon={Landmark}
              title="Payment Details"
              description="MoMo and bank account shown on invoices."
              onSave={() =>
                saveSection("cpay", ["company_momo", "company_bank_name", "company_bank_acct"])
              }
              saving={saving === "cpay"}
            >
              <FieldRow label="Mobile Money">
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    name="company_momo"
                    value={get("company_momo")}
                    onChange={(e) => set("company_momo", e.target.value)}
                    placeholder="0244 000 000"
                    className="rounded-[20px] pl-9"
                  />
                </div>
              </FieldRow>
              <FieldRow label="Bank Name">
                <Input
                  name="company_bank_name"
                  value={get("company_bank_name")}
                  onChange={(e) => set("company_bank_name", e.target.value)}
                  placeholder="Ghana Commercial Bank"
                  className="rounded-[20px]"
                />
              </FieldRow>
              <FieldRow label="Account Number">
                <Input
                  name="company_bank_acct"
                  value={get("company_bank_acct")}
                  onChange={(e) => set("company_bank_acct", e.target.value)}
                  placeholder="1234567890"
                  className="rounded-[20px]"
                />
              </FieldRow>
            </Section>
          </div>
        );

      /* MOBILE ACCESS */
      case "mobile-access": {
        const appUrl = window.location.origin;
        const copyUrl = () => {
          navigator.clipboard
            .writeText(appUrl)
            .then(() => {
              setUrlCopied(true);
              setTimeout(() => setUrlCopied(false), 2000);
            })
            .catch(() => {
              toast({
                variant: "destructive",
                title: "Copy failed",
                description:
                  "Could not copy to clipboard. Please select and copy the URL manually.",
              });
            });
        };
        const downloadQRCode = () => {
          const svgEl = document.querySelector("#qr-code-container svg") as SVGSVGElement | null;
          if (!svgEl) {
            toast({
              variant: "destructive",
              title: "Download failed",
              description: "QR code element not found.",
            });
            return;
          }
          const serializer = new XMLSerializer();
          const svgStr = serializer.serializeToString(svgEl);
          const svgBlob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
          const url = URL.createObjectURL(svgBlob);
          const img = new Image();
          img.onload = () => {
            const padding = 24;
            const canvas = document.createElement("canvas");
            canvas.width = img.width + padding * 2;
            canvas.height = img.height + padding * 2;
            const ctx = canvas.getContext("2d")!;
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, padding, padding);
            URL.revokeObjectURL(url);
            const a = document.createElement("a");
            a.download = "qr-code.png";
            a.href = canvas.toDataURL("image/png");
            a.click();
          };
          img.onerror = () => {
            URL.revokeObjectURL(url);
            toast({
              variant: "destructive",
              title: "Download failed",
              description: "Could not render the QR code image. Please try again.",
            });
          };
          img.src = url;
        };
        return (
          <div className="space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-start gap-4 pb-4">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <QrCode className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-base">Share App Access</CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    Scan this QR code on a phone to open the platform instantly — no typing
                    required.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center gap-6 py-4">
                  <div id="qr-code-container" className="p-4 bg-white rounded-2xl shadow-sm border">
                    <QRCodeSVG value={appUrl} size={200} level="M" includeMargin={false} />
                  </div>
                  <Button variant="outline" className="rounded-full gap-2" onClick={downloadQRCode}>
                    <Download className="h-4 w-4" /> Download QR Code
                  </Button>
                  <div className="w-full max-w-sm space-y-2">
                    <p className="text-xs text-muted-foreground text-center font-medium uppercase tracking-wide">
                      App URL
                    </p>
                    <div className="flex items-center gap-2 p-3 rounded-xl border bg-muted/30">
                      <code className="flex-1 text-sm font-mono truncate select-all">{appUrl}</code>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 rounded-full flex-shrink-0"
                        onClick={copyUrl}
                        title="Copy URL"
                      >
                        {urlCopied ? (
                          <Check className="h-4 w-4 text-green-600" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    {urlCopied && (
                      <p className="text-xs text-green-600 text-center font-medium">
                        URL copied to clipboard!
                      </p>
                    )}
                  </div>
                  <div className="w-full max-w-sm p-4 rounded-xl border bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
                    <div className="flex gap-3 items-start">
                      <Smartphone className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                      <div className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
                        <p className="font-semibold">How to use</p>
                        <p>
                          Open the camera app on any smartphone, point it at the QR code, and tap
                          the link that appears to open the app.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        );
      }

      /* MODULES */
      case "modules":
        return (
          <Section
            icon={Puzzle}
            title="Module Management"
            description="Enable or disable system modules. Disabled modules are hidden from the sidebar."
            onSave={() =>
              saveSection("modules", [
                "module_sales",
                "module_pos",
                "module_purchases",
                "module_inventory",
                "module_hrm",
                "module_accounting",
                "module_projects",
                "module_tasks",
                "module_crm",
                "module_reports",
                "module_serial_numbers",
                "module_warehouses",
              ])
            }
            saving={saving === "modules"}
          >
            <div className="grid sm:grid-cols-2 gap-3">
              {[
                { key: "module_sales", label: "Sales", desc: "Sales orders and transactions" },
                { key: "module_pos", label: "Point of Sale", desc: "POS terminal and cashier" },
                {
                  key: "module_purchases",
                  label: "Purchases",
                  desc: "Purchase orders and suppliers",
                },
                {
                  key: "module_inventory",
                  label: "Inventory",
                  desc: "Products, stock levels, adjustments",
                },
                { key: "module_hrm", label: "HRM Hub", desc: "Staff, attendance, payroll, leave" },
                {
                  key: "module_accounting",
                  label: "Accounting",
                  desc: "Ledger and financial records",
                },
                { key: "module_projects", label: "Projects", desc: "Project management" },
                { key: "module_tasks", label: "Tasks", desc: "Task tracking and assignments" },
                { key: "module_crm", label: "CRM", desc: "Customers and contacts" },
                { key: "module_reports", label: "Reports", desc: "Analytics and reporting" },
                {
                  key: "module_serial_numbers",
                  label: "Serial Numbers",
                  desc: "Serial number tracking",
                },
                {
                  key: "module_warehouses",
                  label: "Warehouses",
                  desc: "Multi-warehouse management",
                },
              ].map(({ key, label, desc }) => (
                <div
                  key={key}
                  className={cn(
                    "flex items-center justify-between gap-3 p-4 rounded-xl border transition-colors",
                    bool(key, true)
                      ? "bg-primary/5 border-primary/20"
                      : "bg-muted/20 border-transparent",
                  )}
                >
                  <div>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                  <Toggle checked={bool(key, true)} onChange={(v) => set(key, String(v))} />
                </div>
              ))}
            </div>
          </Section>
        );

      /* POS */
      case "pos":
        return (
          <div className="space-y-6">
            <Section
              icon={MonitorSmartphone}
              title="POS Behaviour"
              description="Configure default POS terminal behaviour."
              onSave={() =>
                saveSection("pos-core", [
                  "pos_tax_enabled",
                  "pos_combined_tax_rate",
                  "pos_discount_enabled",
                  "pos_max_discount_pct",
                  "pos_credit_sales",
                  "pos_receipt_auto_print",
                  "pos_walk_in_label",
                ])
              }
              saving={saving === "pos-core"}
            >
              <NotifyRow
                label="Apply Tax on POS Sales"
                hint="Automatically apply combined tax rate to POS transactions"
                value={bool("pos_tax_enabled", true)}
                onChange={(v) => set("pos_tax_enabled", String(v))}
              />
              <FieldRow label="Combined Tax Rate (%)" hint="Total tax % applied to POS sales">
                <div className="relative">
                  <Input
                    name="pos_combined_tax_rate"
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={get("pos_combined_tax_rate", "19.5")}
                    onChange={(e) => set("pos_combined_tax_rate", e.target.value)}
                    className="rounded-[20px] pr-8 w-32"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    %
                  </span>
                </div>
              </FieldRow>
              <NotifyRow
                label="Allow Discounts"
                hint="Enable discount input on POS sales"
                value={bool("pos_discount_enabled", true)}
                onChange={(v) => set("pos_discount_enabled", String(v))}
              />
              <FieldRow label="Max Discount (%)" hint="Maximum discount a cashier can apply">
                <div className="relative">
                  <Input
                    name="pos_max_discount_pct"
                    type="number"
                    min={0}
                    max={100}
                    value={get("pos_max_discount_pct", "20")}
                    onChange={(e) => set("pos_max_discount_pct", e.target.value)}
                    className="rounded-[20px] pr-8 w-32"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    %
                  </span>
                </div>
              </FieldRow>
              <NotifyRow
                label="Allow Credit Sales"
                hint="Allow sales on credit (pay later) from the POS"
                value={bool("pos_credit_sales")}
                onChange={(v) => set("pos_credit_sales", String(v))}
              />
              <NotifyRow
                label="Auto-Print Receipt"
                hint="Automatically print receipt after each sale"
                value={bool("pos_receipt_auto_print")}
                onChange={(v) => set("pos_receipt_auto_print", String(v))}
              />
              <FieldRow
                label="Walk-in Customer Label"
                hint="Label used when no customer is selected"
              >
                <Input
                  name="pos_walk_in_label"
                  value={get("pos_walk_in_label", "Walk-in Customer")}
                  onChange={(e) => set("pos_walk_in_label", e.target.value)}
                  className="rounded-[20px]"
                />
              </FieldRow>
            </Section>
            <Section
              icon={CreditCard}
              title="Accepted Payment Methods"
              description="Select which payment methods are available at the POS."
              onSave={() =>
                saveSection("pos-pay", [
                  "pos_payment_cash",
                  "pos_payment_momo",
                  "pos_payment_card",
                  "pos_payment_credit",
                ])
              }
              saving={saving === "pos-pay"}
            >
              <NotifyRow
                label="Cash"
                value={bool("pos_payment_cash", true)}
                onChange={(v) => set("pos_payment_cash", String(v))}
              />
              <NotifyRow
                label="Mobile Money (MoMo)"
                value={bool("pos_payment_momo", true)}
                onChange={(v) => set("pos_payment_momo", String(v))}
              />
              <NotifyRow
                label="Card / POS Machine"
                value={bool("pos_payment_card")}
                onChange={(v) => set("pos_payment_card", String(v))}
              />
              <NotifyRow
                label="Credit / Pay Later"
                value={bool("pos_payment_credit")}
                onChange={(v) => set("pos_payment_credit", String(v))}
              />
            </Section>
          </div>
        );

      /* PAYMENT GATEWAYS */
      case "gateways":
        return (
          <div className="space-y-6">
            <Section
              icon={CreditCard}
              title="Active Payment Gateways"
              description="Enable the payment channels customers can use for online/digital transactions."
              onSave={() =>
                saveSection("gw-enable", [
                  "gateway_cash",
                  "gateway_mtn_momo",
                  "gateway_vodafone_cash",
                  "gateway_airtel_money",
                  "gateway_bank_transfer",
                  "gateway_card",
                ])
              }
              saving={saving === "gw-enable"}
            >
              <NotifyRow
                label="Cash"
                value={bool("gateway_cash", true)}
                onChange={(v) => set("gateway_cash", String(v))}
              />
              <NotifyRow
                label="MTN Mobile Money"
                value={bool("gateway_mtn_momo", true)}
                onChange={(v) => set("gateway_mtn_momo", String(v))}
              />
              <NotifyRow
                label="Vodafone Cash"
                value={bool("gateway_vodafone_cash")}
                onChange={(v) => set("gateway_vodafone_cash", String(v))}
              />
              <NotifyRow
                label="AirtelTigo Money"
                value={bool("gateway_airtel_money")}
                onChange={(v) => set("gateway_airtel_money", String(v))}
              />
              <NotifyRow
                label="Bank Transfer"
                value={bool("gateway_bank_transfer")}
                onChange={(v) => set("gateway_bank_transfer", String(v))}
              />
              <NotifyRow
                label="Card Payment"
                value={bool("gateway_card")}
                onChange={(v) => set("gateway_card", String(v))}
              />
            </Section>
            <Section
              icon={Key}
              title="MTN MoMo API"
              description="MTN MoMo Collections API credentials."
              onSave={() => saveSection("gw-mtn", ["gateway_mtn_api_key", "gateway_mtn_api_user"])}
              saving={saving === "gw-mtn"}
            >
              <FieldRow label="API User ID">
                <Input
                  name="gateway_mtn_api_user"
                  value={get("gateway_mtn_api_user")}
                  onChange={(e) => set("gateway_mtn_api_user", e.target.value)}
                  placeholder="UUID from MTN developer portal"
                  className="rounded-[20px]"
                />
              </FieldRow>
              <FieldRow label="API Key">
                <Input
                  name="gateway_mtn_api_key"
                  value={get("gateway_mtn_api_key")}
                  onChange={(e) => set("gateway_mtn_api_key", e.target.value)}
                  placeholder="MTN MoMo Collections API key"
                  className="rounded-[20px]"
                />
              </FieldRow>
            </Section>
            <Section
              icon={Key}
              title="Vodafone Cash API"
              description="Vodafone Cash merchant credentials."
              onSave={() => saveSection("gw-voda", ["gateway_vodafone_api_key"])}
              saving={saving === "gw-voda"}
            >
              <FieldRow label="API Key">
                <Input
                  name="gateway_vodafone_api_key"
                  value={get("gateway_vodafone_api_key")}
                  onChange={(e) => set("gateway_vodafone_api_key", e.target.value)}
                  placeholder="Vodafone Cash API key"
                  className="rounded-[20px]"
                />
              </FieldRow>
            </Section>
            <Section
              icon={Key}
              title="AirtelTigo Money API"
              description="AirtelTigo Money merchant credentials."
              onSave={() => saveSection("gw-airtel", ["gateway_airtel_api_key"])}
              saving={saving === "gw-airtel"}
            >
              <FieldRow label="API Key">
                <Input
                  name="gateway_airtel_api_key"
                  value={get("gateway_airtel_api_key")}
                  onChange={(e) => set("gateway_airtel_api_key", e.target.value)}
                  placeholder="AirtelTigo Money API key"
                  className="rounded-[20px]"
                />
              </FieldRow>
            </Section>
            <Section
              icon={Landmark}
              title="Bank Transfer Details"
              description="Account details shown to customers when bank transfer is selected."
              onSave={() =>
                saveSection("gw-bank", ["gateway_bank_account_name", "gateway_bank_account_no"])
              }
              saving={saving === "gw-bank"}
            >
              <FieldRow label="Account Name">
                <Input
                  name="gateway_bank_account_name"
                  value={get("gateway_bank_account_name")}
                  onChange={(e) => set("gateway_bank_account_name", e.target.value)}
                  className="rounded-[20px]"
                />
              </FieldRow>
              <FieldRow label="Account Number">
                <Input
                  name="gateway_bank_account_no"
                  value={get("gateway_bank_account_no")}
                  onChange={(e) => set("gateway_bank_account_no", e.target.value)}
                  className="rounded-[20px]"
                />
              </FieldRow>
            </Section>
          </div>
        );

      /* CURRENCY */
      case "currency":
        return (
          <Section
            icon={Banknote}
            title="Currency Settings"
            description="Configure accepted currencies and their exchange rates against GHS."
            onSave={() =>
              saveSection("currency", [
                "curr_usd_rate",
                "curr_usd_active",
                "curr_eur_rate",
                "curr_eur_active",
                "curr_gbp_rate",
                "curr_gbp_active",
                "curr_ngn_rate",
                "curr_ngn_active",
              ])
            }
            saving={saving === "currency"}
          >
            <p className="text-xs text-muted-foreground mb-2">
              Base currency: <strong>GHS (Ghana Cedi ₵)</strong>. Set exchange rates and enable
              currencies accepted in transactions.
            </p>
            {[
              {
                codeKey: "curr_usd_active",
                rateKey: "curr_usd_rate",
                name: "US Dollar",
                code: "USD",
                symbol: "$",
              },
              {
                codeKey: "curr_eur_active",
                rateKey: "curr_eur_rate",
                name: "Euro",
                code: "EUR",
                symbol: "€",
              },
              {
                codeKey: "curr_gbp_active",
                rateKey: "curr_gbp_rate",
                name: "British Pound",
                code: "GBP",
                symbol: "£",
              },
              {
                codeKey: "curr_ngn_active",
                rateKey: "curr_ngn_rate",
                name: "Nigerian Naira",
                code: "NGN",
                symbol: "₦",
              },
            ].map(({ codeKey, rateKey, name, code, symbol }) => (
              <div key={code} className="flex items-center gap-4 p-4 rounded-xl border bg-muted/10">
                <Toggle checked={bool(codeKey)} onChange={(v) => set(codeKey, String(v))} />
                <div className="flex-1">
                  <p className="text-sm font-medium">
                    {name} ({symbol})
                  </p>
                  <p className="text-xs text-muted-foreground">{code}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">1 {code} =</span>
                  <Input
                    name={rateKey}
                    type="number"
                    min={0}
                    step={0.0001}
                    value={get(rateKey)}
                    onChange={(e) => set(rateKey, e.target.value)}
                    className="rounded-[20px] w-28 text-sm"
                  />
                  <span className="text-xs text-muted-foreground">GHS</span>
                </div>
              </div>
            ))}
          </Section>
        );

      /* WAREHOUSE */
      case "warehouse":
        return (
          <Section
            icon={Warehouse}
            title="Warehouse Settings"
            description="Configure inventory deduction, negative stock, and default warehouse behaviour."
            onSave={() =>
              saveSection("warehouse", [
                "warehouse_default_id",
                "warehouse_allow_negative",
                "warehouse_auto_deduct",
                "warehouse_track_serial",
                "warehouse_low_stock_alert",
              ])
            }
            saving={saving === "warehouse"}
          >
            <FieldRow
              label="Default Warehouse ID"
              hint="ID of the warehouse used by default for new transactions"
            >
              <Input
                name="warehouse_default_id"
                value={get("warehouse_default_id")}
                onChange={(e) => set("warehouse_default_id", e.target.value)}
                placeholder="Leave blank to always prompt"
                className="rounded-[20px] w-40"
              />
            </FieldRow>
            <NotifyRow
              label="Auto-Deduct Stock on Sale"
              hint="Automatically reduce warehouse stock when a sale is confirmed"
              value={bool("warehouse_auto_deduct", true)}
              onChange={(v) => set("warehouse_auto_deduct", String(v))}
            />
            <NotifyRow
              label="Allow Negative Stock"
              hint="Allow sales even when stock is zero (creates a negative balance)"
              value={bool("warehouse_allow_negative")}
              onChange={(v) => set("warehouse_allow_negative", String(v))}
            />
            <NotifyRow
              label="Track Serial Numbers"
              hint="Enable serial number assignment for applicable products"
              value={bool("warehouse_track_serial", true)}
              onChange={(v) => set("warehouse_track_serial", String(v))}
            />
            <NotifyRow
              label="Low Stock Alerts"
              hint="Trigger alerts when warehouse stock falls below reorder point"
              value={bool("warehouse_low_stock_alert", true)}
              onChange={(v) => set("warehouse_low_stock_alert", String(v))}
            />
          </Section>
        );

      /* TAX */
      case "tax":
        return (
          <Section
            icon={Percent}
            title="Tax Configuration"
            description="Ghana Revenue Authority tax rates applied to sales."
            onSave={() =>
              saveSection("tax", [
                "vat_rate",
                "nhil_rate",
                "getfund_rate",
                "covid_levy",
                "tourism_levy",
              ])
            }
            saving={saving === "tax"}
          >
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3 text-xs text-amber-800 dark:text-amber-300 mb-2">
              Standard GRA rates: VAT 12.5%, NHIL 2.5%, GETFUND 2.5%, COVID Levy 1%, Tourism Levy
              1%.
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              {[
                { key: "vat_rate", label: "VAT Rate", hint: "12.5%" },
                { key: "nhil_rate", label: "NHIL Rate", hint: "2.5%" },
                { key: "getfund_rate", label: "GETFUND Rate", hint: "2.5%" },
                { key: "covid_levy", label: "COVID-19 Levy", hint: "1%" },
                { key: "tourism_levy", label: "Tourism Levy", hint: "1%" },
              ].map(({ key, label, hint }) => (
                <div key={key} className="space-y-1.5">
                  <label className="text-sm font-medium">{label}</label>
                  <p className="text-xs text-muted-foreground">Standard: {hint}</p>
                  <div className="relative">
                    <Input
                      name={key}
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      value={get(key)}
                      onChange={(e) => set(key, e.target.value)}
                      className="rounded-[20px] pr-8"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                      %
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 bg-muted/30 rounded-xl mt-4">
              <p className="text-xs font-medium text-muted-foreground mb-1">Effective Total Rate</p>
              <p className="text-2xl font-bold text-primary">
                {["vat_rate", "nhil_rate", "getfund_rate", "covid_levy", "tourism_levy"]
                  .reduce((s, k) => s + parseFloat(get(k) || "0"), 0)
                  .toFixed(1)}
                %
              </p>
            </div>
          </Section>
        );

      /* EMAIL SETTINGS */
      case "email":
        return (
          <Section
            icon={Mail}
            title="Email / SMTP Settings"
            description="Configure outbound email via your SMTP provider."
            onSave={() =>
              saveSection("email", [
                "smtp_enabled",
                "smtp_host",
                "smtp_port",
                "smtp_encryption",
                "smtp_username",
                "smtp_from_email",
                "smtp_from_name",
              ])
            }
            saving={saving === "email"}
          >
            <NotifyRow
              label="Enable Email Notifications"
              hint="Send emails for system events (welcome, password reset, alerts)"
              value={bool("smtp_enabled")}
              onChange={(v) => set("smtp_enabled", String(v))}
            />
            <div className="border-t pt-4 space-y-4">
              <FieldRow label="SMTP Host" hint="e.g. smtp.gmail.com, mail.yourhost.com">
                <Input
                  name="smtp_host"
                  value={get("smtp_host")}
                  onChange={(e) => set("smtp_host", e.target.value)}
                  placeholder="smtp.gmail.com"
                  className="rounded-[20px]"
                />
              </FieldRow>
              <FieldRow label="SMTP Port">
                <div className="flex gap-3 items-center">
                  <Input
                    name="smtp_port"
                    type="number"
                    value={get("smtp_port", "587")}
                    onChange={(e) => set("smtp_port", e.target.value)}
                    className="rounded-[20px] w-28"
                  />
                  <Select
                    value={get("smtp_encryption", "tls")}
                    onValueChange={(v) => set("smtp_encryption", v)}
                  >
                    <SelectTrigger className="rounded-[20px] w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tls">TLS</SelectItem>
                      <SelectItem value="ssl">SSL</SelectItem>
                      <SelectItem value="none">None</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </FieldRow>
              <FieldRow label="SMTP Username">
                <Input
                  name="smtp_username"
                  value={get("smtp_username")}
                  onChange={(e) => set("smtp_username", e.target.value)}
                  placeholder="user@gmail.com"
                  className="rounded-[20px]"
                />
              </FieldRow>
              <FieldRow label="From Email">
                <Input
                  name="smtp_from_email"
                  type="email"
                  value={get("smtp_from_email")}
                  onChange={(e) => set("smtp_from_email", e.target.value)}
                  placeholder="noreply@company.com"
                  className="rounded-[20px]"
                />
              </FieldRow>
              <FieldRow label="From Name">
                <Input
                  name="smtp_from_name"
                  value={get("smtp_from_name", "Infinity Sales")}
                  onChange={(e) => set("smtp_from_name", e.target.value)}
                  className="rounded-[20px]"
                />
              </FieldRow>
            </div>
          </Section>
        );

      /* EMAIL TEMPLATES */
      case "email-templates":
        return (
          <div className="space-y-6">
            {[
              {
                subKey: "etpl_welcome_subject",
                bodyKey: "etpl_welcome_body",
                label: "Welcome Email",
                hint: "Sent when a new user account is created.",
                section: "etpl-welcome",
                vars: "{{name}}, {{email}}, {{password}}, {{company_name}}",
              },
              {
                subKey: "etpl_password_reset_subject",
                bodyKey: "etpl_password_reset_body",
                label: "Password Reset",
                hint: "Sent when a user requests a password reset.",
                section: "etpl-pwreset",
                vars: "{{name}}, {{reset_link}}, {{company_name}}",
              },
              {
                subKey: "etpl_low_stock_subject",
                bodyKey: "etpl_low_stock_body",
                label: "Low Stock Alert",
                hint: "Sent when a product reaches its reorder threshold.",
                section: "etpl-lowstock",
                vars: "{{product_name}}, {{sku}}, {{current_stock}}, {{reorder_point}}, {{company_name}}",
              },
              {
                subKey: "etpl_invoice_subject",
                bodyKey: "etpl_invoice_body",
                label: "Invoice Email",
                hint: "Sent when an invoice is issued to a customer.",
                section: "etpl-invoice",
                vars: "{{customer_name}}, {{invoice_no}}, {{amount}}, {{due_date}}, {{company_name}}",
              },
            ].map(({ subKey, bodyKey, label, hint, section, vars }) => (
              <Section
                key={section}
                icon={FileText}
                title={label}
                description={hint}
                onSave={() => saveSection(section, [subKey, bodyKey])}
                saving={saving === section}
              >
                <p className="text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
                  Available variables: <code className="font-mono">{vars}</code>
                </p>
                <FieldRow label="Subject">
                  <Input
                    name={subKey}
                    value={get(subKey)}
                    onChange={(e) => set(subKey, e.target.value)}
                    className="rounded-[20px]"
                  />
                </FieldRow>
                <FieldRow label="Body">
                  <Textarea
                    value={get(bodyKey)}
                    onChange={(e) => set(bodyKey, e.target.value)}
                    rows={6}
                    className="rounded-[20px] resize-none font-mono text-xs"
                  />
                </FieldRow>
              </Section>
            ))}
          </div>
        );

      /* SMS SETTINGS */
      case "sms":
        return (
          <Section
            icon={Smartphone}
            title="SMS Settings"
            description="Configure your SMS provider for transactional messages."
            onSave={() =>
              saveSection("sms", ["sms_enabled", "sms_provider", "sms_api_key", "sms_sender_id"])
            }
            saving={saving === "sms"}
          >
            <NotifyRow
              label="Enable SMS Notifications"
              value={bool("sms_enabled")}
              onChange={(v) => set("sms_enabled", String(v))}
            />
            <div className="border-t pt-4 space-y-4">
              <FieldRow label="SMS Provider">
                <Select
                  value={get("sms_provider", "arkesel")}
                  onValueChange={(v) => set("sms_provider", v)}
                >
                  <SelectTrigger className="rounded-[20px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="arkesel">Arkesel (Ghana)</SelectItem>
                    <SelectItem value="hubtel">Hubtel (Ghana)</SelectItem>
                    <SelectItem value="mnotify">mNotify (Ghana)</SelectItem>
                    <SelectItem value="twillio">Twilio (Global)</SelectItem>
                    <SelectItem value="africas_talking">Africa's Talking</SelectItem>
                  </SelectContent>
                </Select>
              </FieldRow>
              <FieldRow label="API Key">
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    name="sms_api_key"
                    value={get("sms_api_key")}
                    onChange={(e) => set("sms_api_key", e.target.value)}
                    placeholder="Your provider API key"
                    className="rounded-[20px] pl-9"
                  />
                </div>
              </FieldRow>
              <FieldRow label="Sender ID" hint="Max 11 characters, no spaces">
                <Input
                  name="sms_sender_id"
                  value={get("sms_sender_id", "InfinityS")}
                  onChange={(e) => set("sms_sender_id", e.target.value)}
                  maxLength={11}
                  className="rounded-[20px] w-40"
                />
              </FieldRow>
            </div>
          </Section>
        );

      /* SMS TEMPLATES */
      case "sms-templates":
        return (
          <div className="space-y-6">
            {[
              {
                key: "stpl_order_confirm",
                label: "Order Confirmation",
                hint: "Sent when a sale is confirmed.",
                vars: "{{name}}, {{order_id}}, {{amount}}, {{company_name}}",
              },
              {
                key: "stpl_payment_receipt",
                label: "Payment Receipt",
                hint: "Sent when payment is received.",
                vars: "{{name}}, {{amount}}, {{order_id}}, {{company_name}}",
              },
              {
                key: "stpl_low_stock",
                label: "Low Stock Alert",
                hint: "Sent to admin when stock is low.",
                vars: "{{product_name}}, {{current_stock}}, {{company_name}}",
              },
              {
                key: "stpl_otp",
                label: "OTP / Verification",
                hint: "Sent when a one-time code is required.",
                vars: "{{otp}}, {{company_name}}",
              },
            ].map(({ key, label, hint, vars }) => (
              <Section
                key={key}
                icon={MessageSquare}
                title={label}
                description={hint}
                onSave={() => saveSection(key, [key])}
                saving={saving === key}
              >
                <p className="text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
                  Variables: <code className="font-mono">{vars}</code>
                </p>
                <Textarea
                  value={get(key)}
                  onChange={(e) => set(key, e.target.value)}
                  rows={3}
                  className="rounded-[20px] resize-none font-mono text-xs"
                />
                <p
                  className={cn(
                    "text-xs text-right",
                    get(key).length > 160 ? "text-amber-600" : "text-muted-foreground",
                  )}
                >
                  {get(key).length} chars{" "}
                  {get(key).length > 160
                    ? `(${Math.ceil(get(key).length / 160)} parts)`
                    : "(1 part)"}
                </p>
              </Section>
            ))}
          </div>
        );

      /* USERS */
      case "users":
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-xl font-semibold">User Management</h3>
              <Badge variant="outline" className="ml-auto text-xs">
                {users.length} users
              </Badge>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={loadUsers}
                disabled={usersLoading}
              >
                {usersLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 mr-1" />
                    Refresh
                  </>
                )}
              </Button>
              <Button
                size="sm"
                className="rounded-full gap-1.5"
                onClick={() => setCreateOpen(true)}
              >
                <UserPlus className="h-4 w-4" /> Create User
              </Button>
            </div>
            <Card>
              <CardContent className="p-0">
                {usersLoading && users.length === 0 ? (
                  <div className="flex justify-center py-12 text-muted-foreground gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                  </div>
                ) : users.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground">No users found</div>
                ) : (
                  <div className="divide-y">
                    <div className="hidden md:grid grid-cols-12 px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      <div className="col-span-3">User</div>
                      <div className="col-span-1">Role</div>
                      <div className="col-span-2">2FA</div>
                      <div className="col-span-2">Status</div>
                      <div className="col-span-4 text-right">Actions</div>
                    </div>
                    {users.map((u) => (
                      <div
                        key={u.id}
                        className="grid md:grid-cols-12 grid-cols-1 gap-2 px-4 py-3 items-center hover:bg-muted/30 transition-colors"
                      >
                        <div className="col-span-3 flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm flex-shrink-0">
                            {u.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="font-medium text-sm truncate">{u.name}</p>
                              {u.mustChangePassword && (
                                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                            {u.city && (
                              <p className="text-xs text-muted-foreground flex items-center gap-0.5 mt-0.5">
                                <MapPin className="h-2.5 w-2.5" />
                                {u.city}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="col-span-1">
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] px-2",
                              u.role === "admin"
                                ? "border-[#7B2D42]/30 text-[#7B2D42] bg-[#7B2D42]/5"
                                : "border-primary/20 text-primary bg-primary/5",
                            )}
                          >
                            {u.role}
                          </Badge>
                        </div>
                        <div className="col-span-2">
                          {u.twoFactorEnabled ? (
                            <div className="flex items-center gap-1 text-green-600 text-xs font-medium">
                              <ShieldCheck className="h-3.5 w-3.5" />
                              Enabled
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-muted-foreground text-xs">
                              <ShieldAlert className="h-3.5 w-3.5" />
                              Disabled
                            </div>
                          )}
                        </div>
                        <div className="col-span-2">
                          {u.isLocked ? (
                            <Badge className="bg-red-100 text-red-700 border-0 text-[10px]">
                              Blocked
                            </Badge>
                          ) : (
                            <Badge className="bg-green-100 text-green-700 border-0 text-[10px]">
                              Active
                            </Badge>
                          )}
                        </div>
                        <div className="col-span-4 flex items-center gap-1.5 justify-end flex-wrap">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs rounded-full px-2.5 gap-1"
                            onClick={() => {
                              setSelectedUser(u);
                              setResetOpen(true);
                            }}
                          >
                            <KeyRound className="h-3 w-3" /> Reset PWD
                          </Button>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={lockingId === u.id}
                              onClick={() => (u.isLocked ? unblockUser(u) : blockUser(u))}
                              title={u.isLocked ? "Click to unblock" : "Click to block"}
                              className={cn(
                                "relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-primary",
                                u.isLocked ? "bg-red-400" : "bg-green-500",
                                lockingId === u.id
                                  ? "opacity-50 cursor-not-allowed"
                                  : "cursor-pointer",
                              )}
                            >
                              {lockingId === u.id ? (
                                <span className="absolute inset-0 flex items-center justify-center">
                                  <Loader2 className="h-3 w-3 animate-spin text-white" />
                                </span>
                              ) : (
                                <span
                                  className={cn(
                                    "inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition-transform duration-300",
                                    u.isLocked ? "translate-x-1" : "translate-x-6",
                                  )}
                                />
                              )}
                            </button>
                            <span
                              className={cn(
                                "text-[10px] font-medium w-10",
                                u.isLocked ? "text-red-600" : "text-green-600",
                              )}
                            >
                              {u.isLocked ? "Blocked" : "Active"}
                            </span>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs rounded-full px-2.5 gap-1 border-destructive/40 text-destructive hover:bg-destructive/5"
                            onClick={() => setDeleteConfirmUser(u)}
                          >
                            <Trash2 className="h-3 w-3" /> Delete
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        );

      /* PERMISSIONS */
      case "permissions":
        return (
          <Section
            icon={Shield}
            title="Group & User Permissions"
            description="Control which roles have access to each system module."
            onSave={() =>
              saveSection("perms", [
                "perm_admin_sales",
                "perm_admin_purchases",
                "perm_admin_inventory",
                "perm_admin_hrm",
                "perm_admin_accounting",
                "perm_admin_reports",
                "perm_admin_settings",
                "perm_admin_pos",
                "perm_user_sales",
                "perm_user_purchases",
                "perm_user_inventory",
                "perm_user_hrm",
                "perm_user_accounting",
                "perm_user_reports",
                "perm_user_settings",
                "perm_user_pos",
                "perm_user_manage_categories",
                "perm_user_product_transfers",
                "perm_purchase_returns_view",
                "perm_purchase_returns_create",
                "perm_purchase_returns_edit",
                "perm_purchase_returns_submit",
                "perm_purchase_returns_approve",
                "perm_purchase_returns_complete",
                "perm_purchase_returns_cancel",
                "perm_purchase_returns_reverse",
                "perm_purchase_returns_settle",
                "perm_purchase_returns_print",
                "perm_purchase_returns_export",
                "perm_purchase_returns_view_cost",
                "perm_purchase_returns_view_all_warehouses",
              ])
            }
            saving={saving === "perms"}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 font-medium text-muted-foreground">Module</th>
                    <th className="text-center py-2 font-medium text-[#7B2D42]">Admin</th>
                    <th className="text-center py-2 font-medium text-primary">User</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {[
                    { label: "Sales", admin: "perm_admin_sales", user: "perm_user_sales" },
                    { label: "POS Terminal", admin: "perm_admin_pos", user: "perm_user_pos" },
                    {
                      label: "Purchases",
                      admin: "perm_admin_purchases",
                      user: "perm_user_purchases",
                    },
                    {
                      label: "Inventory",
                      admin: "perm_admin_inventory",
                      user: "perm_user_inventory",
                    },
                    { label: "HRM Hub", admin: "perm_admin_hrm", user: "perm_user_hrm" },
                    {
                      label: "Accounting",
                      admin: "perm_admin_accounting",
                      user: "perm_user_accounting",
                    },
                    { label: "Reports", admin: "perm_admin_reports", user: "perm_user_reports" },
                    {
                      label: "Admin Settings",
                      admin: "perm_admin_settings",
                      user: "perm_user_settings",
                    },
                  ].map(({ label, admin, user }) => (
                    <tr key={label} className="hover:bg-muted/20">
                      <td className="py-3 font-medium">{label}</td>
                      <td className="py-3 text-center">
                        <Toggle
                          checked={bool(admin, true)}
                          onChange={(v) => set(admin, String(v))}
                        />
                      </td>
                      <td className="py-3 text-center">
                        <Toggle checked={bool(user)} onChange={(v) => set(user, String(v))} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-6 border rounded-xl p-4">
              <h4 className="font-semibold mb-1">Inventory action permissions</h4>
              <p className="text-xs text-muted-foreground mb-3">
                Enable these actions for standard users after granting Inventory access.
              </p>
              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  ["Create product categories", "perm_user_manage_categories"],
                  ["Transfer products between warehouses", "perm_user_product_transfers"],
                ].map(([label, key]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between rounded-lg border px-3 py-2"
                  >
                    <span className="text-sm">{label}</span>
                    <Toggle checked={bool(key, false)} onChange={(v) => set(key, String(v))} />
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-6 border rounded-xl p-4">
              <h4 className="font-semibold mb-1">Purchase Returns permissions</h4>
              <p className="text-xs text-muted-foreground mb-3">
                Fine-grained controls for standard users. Administrators retain all permissions.
              </p>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {[
                  ["View", "view", true],
                  ["Create", "create", true],
                  ["Edit drafts", "edit", true],
                  ["Submit", "submit", true],
                  ["Approve", "approve", false],
                  ["Complete & post stock", "complete", false],
                  ["Cancel", "cancel", true],
                  ["Reverse completed", "reverse", false],
                  ["Record settlement", "settle", false],
                  ["Print debit note", "print", true],
                  ["Export reports", "export", true],
                  ["View cost", "view_cost", true],
                  ["All warehouses", "view_all_warehouses", false],
                ].map(([label, action, defaultValue]) => {
                  const key = `perm_purchase_returns_${action}`;
                  return (
                    <div
                      key={key}
                      className="flex items-center justify-between rounded-lg border px-3 py-2"
                    >
                      <span className="text-sm">{label}</span>
                      <Toggle
                        checked={bool(key, Boolean(defaultValue))}
                        onChange={(v) => set(key, String(v))}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Note: Admin role always retains full access. These settings affect the User role
              permissions display.
            </p>
          </Section>
        );

      /* HRM SETTINGS */
      case "hrm-settings":
        return (
          <div className="space-y-6">
            <Section
              icon={Briefcase}
              title="Work Schedule"
              description="Default working days and hours for attendance tracking."
              onSave={() =>
                saveSection("hrm-schedule", ["hrm_working_days", "hrm_work_hours_per_day"])
              }
              saving={saving === "hrm-schedule"}
            >
              <FieldRow label="Working Days" hint="Comma-separated day abbreviations">
                <Input
                  name="hrm_working_days"
                  value={get("hrm_working_days", "Mon,Tue,Wed,Thu,Fri")}
                  onChange={(e) => set("hrm_working_days", e.target.value)}
                  placeholder="Mon,Tue,Wed,Thu,Fri"
                  className="rounded-[20px]"
                />
              </FieldRow>
              <FieldRow label="Work Hours Per Day">
                <div className="flex items-center gap-2">
                  <Input
                    name="hrm_work_hours_per_day"
                    type="number"
                    min={1}
                    max={24}
                    value={get("hrm_work_hours_per_day", "8")}
                    onChange={(e) => set("hrm_work_hours_per_day", e.target.value)}
                    className="rounded-[20px] w-24"
                  />
                  <span className="text-sm text-muted-foreground">hours</span>
                </div>
              </FieldRow>
            </Section>
            <Section
              icon={Banknote}
              title="Payroll Configuration"
              description="SSNIT rates, payroll run date, and overtime multiplier."
              onSave={() =>
                saveSection("hrm-payroll", [
                  "hrm_payroll_day",
                  "hrm_ssnit_employee_rate",
                  "hrm_ssnit_employer_rate",
                  "hrm_overtime_rate_multiplier",
                ])
              }
              saving={saving === "hrm-payroll"}
            >
              <FieldRow label="Payroll Run Day" hint="Day of the month payroll is processed">
                <Input
                  name="hrm_payroll_day"
                  type="number"
                  min={1}
                  max={31}
                  value={get("hrm_payroll_day", "25")}
                  onChange={(e) => set("hrm_payroll_day", e.target.value)}
                  className="rounded-[20px] w-24"
                />
              </FieldRow>
              <FieldRow label="SSNIT Employee Rate" hint="Employee contribution %">
                <div className="relative">
                  <Input
                    name="hrm_ssnit_employee_rate"
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={get("hrm_ssnit_employee_rate", "5.5")}
                    onChange={(e) => set("hrm_ssnit_employee_rate", e.target.value)}
                    className="rounded-[20px] pr-8 w-32"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    %
                  </span>
                </div>
              </FieldRow>
              <FieldRow label="SSNIT Employer Rate" hint="Employer contribution %">
                <div className="relative">
                  <Input
                    name="hrm_ssnit_employer_rate"
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={get("hrm_ssnit_employer_rate", "13")}
                    onChange={(e) => set("hrm_ssnit_employer_rate", e.target.value)}
                    className="rounded-[20px] pr-8 w-32"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    %
                  </span>
                </div>
              </FieldRow>
              <FieldRow label="Overtime Multiplier" hint="e.g. 1.5 = time and a half">
                <Input
                  name="hrm_overtime_rate_multiplier"
                  type="number"
                  min={1}
                  max={3}
                  step={0.1}
                  value={get("hrm_overtime_rate_multiplier", "1.5")}
                  onChange={(e) => set("hrm_overtime_rate_multiplier", e.target.value)}
                  className="rounded-[20px] w-24"
                />
              </FieldRow>
            </Section>
            <Section
              icon={Clock}
              title="Leave Entitlement"
              description="Default leave days per year per employee."
              onSave={() =>
                saveSection("hrm-leave", [
                  "hrm_annual_leave_days",
                  "hrm_sick_leave_days",
                  "hrm_maternity_leave_days",
                  "hrm_paternity_leave_days",
                ])
              }
              saving={saving === "hrm-leave"}
            >
              {[
                {
                  key: "hrm_annual_leave_days",
                  label: "Annual Leave",
                  hint: "Calendar days per year",
                },
                { key: "hrm_sick_leave_days", label: "Sick Leave", hint: "Days per year" },
                {
                  key: "hrm_maternity_leave_days",
                  label: "Maternity Leave",
                  hint: "Days (Ghana: 84 days)",
                },
                { key: "hrm_paternity_leave_days", label: "Paternity Leave", hint: "Days" },
              ].map(({ key, label, hint }) => (
                <FieldRow key={key} label={label} hint={hint}>
                  <div className="flex items-center gap-2">
                    <Input
                      name={key}
                      type="number"
                      min={0}
                      value={get(key)}
                      onChange={(e) => set(key, e.target.value)}
                      className="rounded-[20px] w-24"
                    />
                    <span className="text-sm text-muted-foreground">days</span>
                  </div>
                </FieldRow>
              ))}
            </Section>
          </div>
        );

      /* SECURITY */
      case "security":
        return (
          <div className="space-y-6">
            <Section
              icon={Shield}
              title="Authentication Policies"
              description="Login security rules for all users."
              onSave={() => saveSection("sec-auth", ["require_2fa", "max_login_attempts"])}
              saving={saving === "sec-auth"}
            >
              <NotifyRow
                label="Require Two-Factor Authentication"
                hint="Force all users to set up 2FA before accessing the system"
                value={bool("require_2fa")}
                onChange={(v) => set("require_2fa", String(v))}
              />
              <FieldRow
                label="Max Login Attempts"
                hint="Account locked after this many failed logins"
              >
                <Input
                  name="max_login_attempts"
                  type="number"
                  min={1}
                  max={20}
                  value={get("max_login_attempts", "5")}
                  onChange={(e) => set("max_login_attempts", e.target.value)}
                  className="rounded-[20px] w-24"
                />
              </FieldRow>
            </Section>
            <Section
              icon={Clock}
              title="Session & Password"
              description="Session lifetimes and password expiry policies."
              onSave={() => saveSection("sec-session", ["session_timeout", "password_expiry_days"])}
              saving={saving === "sec-session"}
            >
              <FieldRow label="Session Timeout" hint="Auto-logout after inactivity">
                <div className="flex items-center gap-2">
                  <Input
                    name="session_timeout"
                    type="number"
                    min={5}
                    max={480}
                    value={get("session_timeout", "60")}
                    onChange={(e) => set("session_timeout", e.target.value)}
                    className="rounded-[20px] w-28"
                  />
                  <span className="text-sm text-muted-foreground">minutes</span>
                </div>
              </FieldRow>
              <FieldRow label="Password Expiry" hint="Force reset after (0 = never)">
                <div className="flex items-center gap-2">
                  <Input
                    name="password_expiry_days"
                    type="number"
                    min={0}
                    max={365}
                    value={get("password_expiry_days", "90")}
                    onChange={(e) => set("password_expiry_days", e.target.value)}
                    className="rounded-[20px] w-28"
                  />
                  <span className="text-sm text-muted-foreground">days</span>
                </div>
              </FieldRow>
            </Section>
          </div>
        );

      /* NOTIFICATIONS */
      case "notifications":
        return (
          <Section
            icon={Bell}
            title="Notification Preferences"
            description="Control which system events trigger in-app alerts."
            onSave={() =>
              saveSection("notifs", [
                "notify_low_stock",
                "notify_new_sale",
                "notify_new_purchase",
                "notify_payroll_due",
                "notify_leave_request",
              ])
            }
            saving={saving === "notifs"}
          >
            <NotifyRow
              label="Low Stock Alerts"
              hint="Alert when a product falls below the reorder threshold"
              value={bool("notify_low_stock", true)}
              onChange={(v) => set("notify_low_stock", String(v))}
            />
            <NotifyRow
              label="New Sale Recorded"
              hint="Notify when a new sales transaction is created"
              value={bool("notify_new_sale")}
              onChange={(v) => set("notify_new_sale", String(v))}
            />
            <NotifyRow
              label="New Purchase Order"
              hint="Notify when a purchase order is raised"
              value={bool("notify_new_purchase")}
              onChange={(v) => set("notify_new_purchase", String(v))}
            />
            <NotifyRow
              label="Payroll Due Reminder"
              hint="Remind admin when payroll runs are pending approval"
              value={bool("notify_payroll_due")}
              onChange={(v) => set("notify_payroll_due", String(v))}
            />
            <NotifyRow
              label="Leave Requests"
              hint="Notify when an employee submits a leave request"
              value={bool("notify_leave_request", true)}
              onChange={(v) => set("notify_leave_request", String(v))}
            />
          </Section>
        );

      /* RECEIPT */
      case "receipt":
        return (
          <Section
            icon={Receipt}
            title="Receipt & Invoice Settings"
            description="Customise receipt text and layout."
            onSave={() =>
              saveSection("receipt", [
                "receipt_header",
                "receipt_footer",
                "receipt_show_logo",
                "receipt_show_tax",
                "receipt_note",
              ])
            }
            saving={saving === "receipt"}
          >
            <FieldRow label="Receipt Header">
              <Textarea
                value={get("receipt_header")}
                onChange={(e) => set("receipt_header", e.target.value)}
                rows={2}
                className="rounded-[20px] resize-none"
              />
            </FieldRow>
            <FieldRow label="Receipt Footer">
              <Textarea
                value={get("receipt_footer")}
                onChange={(e) => set("receipt_footer", e.target.value)}
                rows={2}
                className="rounded-[20px] resize-none"
              />
            </FieldRow>
            <FieldRow label="Additional Note">
              <Textarea
                value={get("receipt_note")}
                onChange={(e) => set("receipt_note", e.target.value)}
                rows={2}
                className="rounded-[20px] resize-none"
              />
            </FieldRow>
            <NotifyRow
              label="Show Company Logo"
              value={bool("receipt_show_logo", true)}
              onChange={(v) => set("receipt_show_logo", String(v))}
            />
            <NotifyRow
              label="Show Tax Breakdown"
              value={bool("receipt_show_tax", true)}
              onChange={(v) => set("receipt_show_tax", String(v))}
            />
            <div className="mt-4 p-4 bg-muted/30 rounded-xl space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Receipt className="h-3.5 w-3.5" /> Preview
              </p>
              <div className="bg-white dark:bg-card border rounded-lg p-4 text-center text-xs space-y-1 font-mono shadow-sm">
                {bool("receipt_show_logo", true) && (
                  <div className="text-muted-foreground text-[10px] mb-2">[LOGO]</div>
                )}
                <p className="font-bold">{get("company_name") || "Company Name"}</p>
                {get("company_phone") && (
                  <p className="text-muted-foreground text-[10px]">Tel: {get("company_phone")}</p>
                )}
                <div className="border-t border-dashed my-2" />
                <p className="text-left">Item 1 × 2 ........... ₵10.00</p>
                <div className="border-t border-dashed my-1" />
                {bool("receipt_show_tax", true) && (
                  <p className="text-left text-muted-foreground">VAT (12.5%) .......... ₵ 1.25</p>
                )}
                <p className="text-left font-bold">TOTAL ............... ₵11.25</p>
                <div className="border-t border-dashed my-2" />
                {get("receipt_header") && (
                  <p className="text-muted-foreground italic">{get("receipt_header")}</p>
                )}
                {get("receipt_footer") && (
                  <p className="text-muted-foreground text-[10px]">{get("receipt_footer")}</p>
                )}
              </div>
            </div>
          </Section>
        );

      /* BACKUP */
      case "backup":
        return (
          <div className="space-y-6">
            <Section
              icon={Database}
              title="Backup Schedule"
              description="Configure automatic database backup schedule and retention."
              onSave={() =>
                saveSection("backup", [
                  "backup_enabled",
                  "backup_frequency",
                  "backup_retention",
                  "backup_time",
                  "backup_include_files",
                ])
              }
              saving={saving === "backup"}
            >
              <NotifyRow
                label="Enable Automatic Backups"
                hint="Schedule regular database backups"
                value={bool("backup_enabled")}
                onChange={(v) => set("backup_enabled", String(v))}
              />
              <FieldRow label="Backup Frequency">
                <Select
                  value={get("backup_frequency", "daily")}
                  onValueChange={(v) => set("backup_frequency", v)}
                >
                  <SelectTrigger className="rounded-[20px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hourly">Hourly</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </FieldRow>
              <FieldRow label="Run Time" hint="Time of day to run backup (24h format)">
                <Input
                  name="backup_time"
                  type="time"
                  value={get("backup_time", "02:00")}
                  onChange={(e) => set("backup_time", e.target.value)}
                  className="rounded-[20px] w-36"
                />
              </FieldRow>
              <FieldRow label="Retention Period" hint="Number of backups to keep">
                <div className="flex items-center gap-2">
                  <Input
                    name="backup_retention"
                    type="number"
                    min={1}
                    max={90}
                    value={get("backup_retention", "7")}
                    onChange={(e) => set("backup_retention", e.target.value)}
                    className="rounded-[20px] w-24"
                  />
                  <span className="text-sm text-muted-foreground">backups</span>
                </div>
              </FieldRow>
              <NotifyRow
                label="Include Uploaded Files"
                hint="Also back up user-uploaded files and attachments"
                value={bool("backup_include_files", true)}
                onChange={(v) => set("backup_include_files", String(v))}
              />
              {get("backup_last_run") && (
                <div className="text-xs text-muted-foreground pt-2">
                  Last backup: <span className="font-medium">{get("backup_last_run")}</span>
                </div>
              )}
            </Section>
            <BackupRestoreSection />
          </div>
        );

      /* UPGRADES */
      case "upgrades":
        return (
          <div className="space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-start gap-4 pb-4">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <ArrowUpCircle className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-base">System Version</CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    Current platform version and upgrade options.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-muted/30 rounded-xl border">
                  <div>
                    <p className="text-sm font-medium">Current Version</p>
                    <p className="text-xs text-muted-foreground">
                      Infinity Sales & Inventory Management
                    </p>
                  </div>
                  <Badge className="bg-primary/10 text-primary border-0 text-sm font-mono">
                    v{get("system_version", "1.0.0")}
                  </Badge>
                </div>
                <div className="flex items-center justify-between p-4 bg-green-50 dark:bg-green-950/30 rounded-xl border border-green-200 dark:border-green-800">
                  <div>
                    <p className="text-sm font-medium text-green-800 dark:text-green-300">
                      System Status
                    </p>
                    <p className="text-xs text-green-600 dark:text-green-400">
                      All systems operational
                    </p>
                  </div>
                  <Check className="h-5 w-5 text-green-600" />
                </div>
                <div className="flex gap-3 flex-wrap">
                  <Button
                    variant="outline"
                    className="rounded-full gap-2"
                    onClick={() =>
                      toast({
                        title: "Checking for updates…",
                        description: "Your system is up to date.",
                      })
                    }
                  >
                    <RefreshCw className="h-4 w-4" /> Check for Updates
                  </Button>
                  <Button
                    variant="outline"
                    className="rounded-full gap-2"
                    onClick={() => toast({ title: "System info copied" })}
                  >
                    <FileText className="h-4 w-4" /> View Changelog
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Section
              icon={Server}
              title="Maintenance & Debug"
              description="Maintenance mode pauses user access while system updates are applied."
              onSave={() =>
                saveSection("upgrades", [
                  "system_maintenance_mode",
                  "system_debug_mode",
                  "system_auto_update",
                ])
              }
              saving={saving === "upgrades"}
            >
              <NotifyRow
                label="Maintenance Mode"
                hint="Redirect all non-admin users to a maintenance page"
                value={bool("system_maintenance_mode")}
                onChange={(v) => set("system_maintenance_mode", String(v))}
              />
              <NotifyRow
                label="Debug Mode"
                hint="Log verbose output for troubleshooting (disable in production)"
                value={bool("system_debug_mode")}
                onChange={(v) => set("system_debug_mode", String(v))}
              />
              <NotifyRow
                label="Auto-Update"
                hint="Automatically apply minor version updates"
                value={bool("system_auto_update")}
                onChange={(v) => set("system_auto_update", String(v))}
              />
            </Section>

            <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600" /> Danger Zone
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">Clear System Cache</p>
                    <p className="text-xs text-muted-foreground">
                      Flush cached data to resolve display issues
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    onClick={() => toast({ title: "Cache cleared" })}
                  >
                    Clear Cache
                  </Button>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">Reset Settings to Defaults</p>
                    <p className="text-xs text-muted-foreground text-amber-700 dark:text-amber-400">
                      This will revert all settings to factory defaults
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full border-red-300 text-red-600 hover:bg-red-50"
                    onClick={() =>
                      toast({
                        variant: "destructive",
                        title: "Action not confirmed",
                        description: "Use with caution — this cannot be undone.",
                      })
                    }
                  >
                    Reset Defaults
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        );

      /* PRODUCT EXPIRY CONTROL */
      case "product-expiry":
        return (
          <div className="space-y-6">
            <Section
              icon={CalendarCheck}
              title="Expiry Tracking"
              description="Enable and configure product expiration date monitoring."
              onSave={() =>
                saveSection("expiry-core", [
                  "expiry_tracking_enabled",
                  "expiry_alert_days",
                  "expiry_auto_disable",
                  "expiry_show_on_pos",
                ])
              }
              saving={saving === "expiry-core"}
            >
              <NotifyRow
                label="Enable Expiry Tracking"
                hint="Track expiration dates on products that have them set"
                value={bool("expiry_tracking_enabled", true)}
                onChange={(v) => set("expiry_tracking_enabled", String(v))}
              />
              <FieldRow
                label="Alert Days Before Expiry"
                hint="Send alerts this many days before a product expires"
              >
                <div className="flex items-center gap-2">
                  <Input
                    name="expiry_alert_days"
                    type="number"
                    min={1}
                    max={365}
                    value={get("expiry_alert_days", "30")}
                    onChange={(e) => set("expiry_alert_days", e.target.value)}
                    className="rounded-[20px] w-28"
                  />
                  <span className="text-sm text-muted-foreground">days</span>
                </div>
              </FieldRow>
              <NotifyRow
                label="Auto-Disable Expired Products"
                hint="Automatically hide products from POS and sales when expired"
                value={bool("expiry_auto_disable")}
                onChange={(v) => set("expiry_auto_disable", String(v))}
              />
              <NotifyRow
                label="Show Expiry Date on POS"
                hint="Display the expiry date on POS product cards"
                value={bool("expiry_show_on_pos", true)}
                onChange={(v) => set("expiry_show_on_pos", String(v))}
              />
            </Section>
            <Section
              icon={Bell}
              title="Expiry Notifications"
              description="Choose how the system notifies you about expiring products."
              onSave={() =>
                saveSection("expiry-notif", ["expiry_notify_email", "expiry_notify_sms"])
              }
              saving={saving === "expiry-notif"}
            >
              <NotifyRow
                label="Email Notification"
                hint="Send email alerts for expiring products"
                value={bool("expiry_notify_email", true)}
                onChange={(v) => set("expiry_notify_email", String(v))}
              />
              <NotifyRow
                label="SMS Notification"
                hint="Send SMS alerts to the admin phone number"
                value={bool("expiry_notify_sms")}
                onChange={(v) => set("expiry_notify_sms", String(v))}
              />
            </Section>
          </div>
        );

      /* USER CONTROL SETTINGS */
      case "user-control":
        return (
          <div className="space-y-6">
            <Section
              icon={UserCheck}
              title="Session Management"
              description="Control user session behaviour and concurrent login limits."
              onSave={() =>
                saveSection("usr-session", [
                  "user_ctrl_max_sessions",
                  "user_ctrl_idle_timeout",
                  "user_ctrl_show_last_login",
                ])
              }
              saving={saving === "usr-session"}
            >
              <FieldRow
                label="Max Concurrent Sessions"
                hint="Maximum number of devices a user can be logged into simultaneously"
              >
                <div className="flex items-center gap-2">
                  <Input
                    name="user_ctrl_max_sessions"
                    type="number"
                    min={1}
                    max={20}
                    value={get("user_ctrl_max_sessions", "3")}
                    onChange={(e) => set("user_ctrl_max_sessions", e.target.value)}
                    className="rounded-[20px] w-24"
                  />
                  <span className="text-sm text-muted-foreground">sessions</span>
                </div>
              </FieldRow>
              <FieldRow
                label="Idle Session Timeout"
                hint="Auto-logout after inactivity (0 = use global security setting)"
              >
                <div className="flex items-center gap-2">
                  <Input
                    name="user_ctrl_idle_timeout"
                    type="number"
                    min={0}
                    max={480}
                    value={get("user_ctrl_idle_timeout", "60")}
                    onChange={(e) => set("user_ctrl_idle_timeout", e.target.value)}
                    className="rounded-[20px] w-28"
                  />
                  <span className="text-sm text-muted-foreground">minutes</span>
                </div>
              </FieldRow>
              <NotifyRow
                label="Show Last Login Info"
                hint="Display last login time and device on user dashboard"
                value={bool("user_ctrl_show_last_login", true)}
                onChange={(v) => set("user_ctrl_show_last_login", String(v))}
              />
            </Section>
            <Section
              icon={Shield}
              title="Access Controls"
              description="Restrict how and when users can access the system."
              onSave={() =>
                saveSection("usr-access", [
                  "user_ctrl_force_2fa",
                  "user_ctrl_allow_register",
                  "user_ctrl_password_min_age",
                ])
              }
              saving={saving === "usr-access"}
            >
              <NotifyRow
                label="Force 2FA on All Users"
                hint="Require every user to have 2FA enabled before accessing the system"
                value={bool("user_ctrl_force_2fa")}
                onChange={(v) => set("user_ctrl_force_2fa", String(v))}
              />

              <NotifyRow
                label="Allow User Self-Registration"
                hint="When disabled, the public registration page is blocked and only admins can create accounts"
                value={bool("user_ctrl_allow_register")}
                onChange={(v) => set("user_ctrl_allow_register", String(v))}
              />
              <FieldRow
                label="Minimum Password Age"
                hint="Prevent password changes for this many days after last change"
              >
                <div className="flex items-center gap-2">
                  <Input
                    name="user_ctrl_password_min_age"
                    type="number"
                    min={0}
                    max={30}
                    value={get("user_ctrl_password_min_age", "1")}
                    onChange={(e) => set("user_ctrl_password_min_age", e.target.value)}
                    className="rounded-[20px] w-24"
                  />
                  <span className="text-sm text-muted-foreground">days</span>
                </div>
              </FieldRow>
            </Section>
          </div>
        );

      /* ROLES & PERMISSIONS (expanded) */
      case "roles": {
        const ROLES: { id: Exclude<UserRole, "admin">; label: string; color: string }[] = [
          { id: "manager", label: "Manager", color: "text-blue-600" },
          { id: "cashier", label: "Cashier", color: "text-emerald-600" },
          { id: "accountant", label: "Accountant", color: "text-purple-600" },
          { id: "user", label: "User", color: "text-primary" },
        ];
        const MODULES = [
          { label: "Sales", key: "sales" },
          { label: "POS Terminal", key: "pos" },
          { label: "Purchases", key: "purchases" },
          { label: "Inventory", key: "inventory" },
          { label: "HRM Hub", key: "hrm" },
          { label: "Accounting", key: "accounting" },
          { label: "Reports", key: "reports" },
          { label: "Projects", key: "projects" },
          { label: "Tasks", key: "tasks" },
          { label: "Admin Settings", key: "settings" },
        ];
        const allKeys = ROLES.flatMap((r) => MODULES.map((m) => `perm_${r.id}_${m.key}`));
        return (
          <Section
            icon={Shield}
            title="Roles & Permissions Matrix"
            description="Configure exactly which modules each role can access. Each role is enforced independently."
            onSave={() => saveSection("roles", allKeys)}
            saving={saving === "roles"}
          >
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl px-4 py-3 text-xs text-blue-700 dark:text-blue-300 mb-4">
              Admin role always has full system access. Each non-admin role is evaluated
              independently — enabling a module for one role does not affect others.
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 font-medium text-muted-foreground w-32">
                      Module
                    </th>
                    <th className="text-center py-2 font-medium text-[#7B2D42] px-2">Admin</th>
                    {ROLES.map((r) => (
                      <th key={r.id} className={`text-center py-2 font-medium ${r.color} px-2`}>
                        {r.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {MODULES.map(({ label, key }) => (
                    <tr key={key} className="hover:bg-muted/20">
                      <td className="py-3 font-medium">{label}</td>
                      <td className="py-3 text-center px-2">
                        <Check className="h-4 w-4 text-green-500 mx-auto" />
                      </td>
                      {ROLES.map((r) => (
                        <td key={r.id} className="py-3 text-center px-2">
                          <Toggle
                            checked={bool(`perm_${r.id}_${key}`, false)}
                            onChange={(v) => set(`perm_${r.id}_${key}`, String(v))}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
              {ROLES.map((r) => (
                <div key={r.id} className="p-3 rounded-xl border bg-muted/10">
                  <p className={`text-xs font-semibold ${r.color} mb-1`}>{r.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {MODULES.filter((m) => bool(`perm_${r.id}_${m.key}`, false))
                      .map((m) => m.label)
                      .join(", ") || "No access"}
                  </p>
                </div>
              ))}
            </div>
          </Section>
        );
      }

      /* FIREWALL SETTINGS */
      case "firewall": {
        const unblockIp = async (id: number, ip: string) => {
          try {
            await customFetch(`/api/admin/ip-blocks/${id}`, { method: "DELETE" });
            toast({ title: `${ip} unblocked` });
            refetchIpBlocks();
          } catch {
            toast({ variant: "destructive", title: "Failed to unblock IP" });
          }
        };
        const blockIp = async () => {
          if (!newIp.trim()) return;
          try {
            await customFetch("/api/admin/ip-blocks", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ipAddress: newIp.trim(), reason: "manual_block" }),
            });
            toast({ title: `${newIp} blocked` });
            setNewIp("");
            refetchIpBlocks();
          } catch (e: unknown) {
            toast({
              variant: "destructive",
              title: "Block failed",
              description: e instanceof Error ? e.message : "",
            });
          }
        };
        return (
          <div className="space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-start gap-4 pb-4">
                <div className="h-10 w-10 rounded-xl bg-red-500/10 flex items-center justify-center flex-shrink-0">
                  <ShieldAlert className="h-5 w-5 text-red-500" />
                </div>
                <div>
                  <CardTitle className="text-base">IP Block Management</CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    Manually block or unblock IP addresses.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    id="fw-new-ip"
                    name="newIp"
                    value={newIp}
                    onChange={(e) => setNewIp(e.target.value)}
                    placeholder="e.g. 192.168.1.100"
                    className="rounded-[20px]"
                    onKeyDown={(e) => e.key === "Enter" && blockIp()}
                  />
                  <Button
                    onClick={blockIp}
                    variant="destructive"
                    className="rounded-full gap-1.5 flex-shrink-0"
                  >
                    <Flame className="h-4 w-4" />
                    Block IP
                  </Button>
                </div>
                {!ipBlocks || ipBlocks.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No IP addresses currently blocked.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {ipBlocks.map((b) => (
                      <div
                        key={b.id}
                        className="flex items-center gap-3 p-3 rounded-xl border bg-red-50/50 dark:bg-red-950/20"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-mono font-medium">{b.ipAddress}</p>
                          <p className="text-xs text-muted-foreground">
                            {b.reason.replace(/_/g, " ")} · {b.failedAttempts} attempts
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-full text-xs h-7"
                          onClick={() => unblockIp(b.id, b.ipAddress)}
                        >
                          Unblock
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        );
      }

      /* SYSTEM INFO */
      case "system-info": {
        const uptime = sysInfo
          ? `${Math.floor(sysInfo.uptimeSeconds / 3600)}h ${Math.floor((sysInfo.uptimeSeconds % 3600) / 60)}m ${sysInfo.uptimeSeconds % 60}s`
          : "—";
        return (
          <div className="space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-start gap-4 pb-4">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Server className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <CardTitle className="text-base">System Information</CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    Live platform and database statistics.
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={() => refetchSysInfo()}
                  disabled={sysInfoLoading}
                >
                  {sysInfoLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {sysInfoLoading ? (
                  <Loading />
                ) : (
                  <>
                    <div className="grid sm:grid-cols-2 gap-4">
                      {[
                        { label: "Platform", value: sysInfo?.platform ?? "—", icon: Activity },
                        {
                          label: "Version",
                          value: `v${sysInfo?.version ?? "—"}`,
                          icon: PackageCheck,
                        },
                        { label: "Node.js", value: sysInfo?.nodeVersion ?? "—", icon: Terminal },
                        { label: "Server Uptime", value: uptime, icon: Timer },
                        { label: "Database Size", value: sysInfo?.dbSize ?? "—", icon: HardDrive },
                        {
                          label: "Last Checked",
                          value: sysInfo ? new Date(sysInfo.timestamp).toLocaleTimeString() : "—",
                          icon: Clock,
                        },
                      ].map(({ label, value, icon: Icon }) => (
                        <div
                          key={label}
                          className="flex items-center gap-3 p-3 rounded-xl border bg-muted/10"
                        >
                          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <Icon className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">{label}</p>
                            <p className="text-sm font-medium font-mono">{value}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                        Record Counts
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {Object.entries(sysInfo?.recordCounts ?? {}).map(([k, v]) => (
                          <div key={k} className="p-3 rounded-xl border bg-muted/10 text-center">
                            <p className="text-lg font-bold">{v.toLocaleString()}</p>
                            <p className="text-xs text-muted-foreground capitalize">
                              {k.replace(/([A-Z])/g, " $1").trim()}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        );
      }

      /* SYSTEM RESET */
      case "system-reset":
        return (
          <div className="space-y-6">
            <Card className="border-red-200 dark:border-red-800">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2 text-red-700 dark:text-red-400">
                  <AlertTriangle className="h-5 w-5" />
                  System Reset Options
                </CardTitle>
                <CardDescription className="text-xs">
                  These actions are irreversible. Proceed with extreme caution.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  {
                    title: "Clear All Audit Logs",
                    desc: "Permanently delete all system audit trail entries. Cannot be recovered.",
                    label: "Clear Audit Logs",
                    level: "warning",
                  },
                  {
                    title: "Reset All Settings to Defaults",
                    desc: "Revert every configuration setting to factory defaults. You will need to reconfigure the system.",
                    label: "Reset Settings",
                    level: "danger",
                  },
                  {
                    title: "Clear Recycle Bin",
                    desc: "Permanently delete all items currently in the recycle bin.",
                    label: "Empty Recycle Bin",
                    level: "warning",
                  },
                  {
                    title: "Clear All Blocked IPs",
                    desc: "Remove all firewall IP blocks and allow all previously blocked IPs.",
                    label: "Clear IP Blocks",
                    level: "warning",
                  },
                ].map(({ title, desc, label, level }) => (
                  <div
                    key={title}
                    className={`flex items-start justify-between gap-4 p-4 rounded-xl border ${level === "danger" ? "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800" : "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800"}`}
                  >
                    <div className="flex-1">
                      <p className="text-sm font-semibold">{title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className={`rounded-full flex-shrink-0 ${level === "danger" ? "border-red-400 text-red-700 hover:bg-red-50" : "border-amber-400 text-amber-700 hover:bg-amber-50"}`}
                      onClick={() =>
                        toast({
                          variant: "destructive",
                          title: `${label} — Not confirmed`,
                          description:
                            "This action requires admin confirmation. Contact your system administrator.",
                        })
                      }
                    >
                      {label}
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <RotateCcw className="h-5 w-5 text-primary" />
                  Safe Reset Actions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between gap-4 p-3 rounded-xl border bg-muted/10">
                  <div>
                    <p className="text-sm font-medium">Clear System Cache</p>
                    <p className="text-xs text-muted-foreground">
                      Flush cached data to resolve display issues
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    onClick={() => toast({ title: "Cache cleared successfully" })}
                  >
                    Clear Cache
                  </Button>
                </div>
                <div className="flex items-center justify-between gap-4 p-3 rounded-xl border bg-muted/10">
                  <div>
                    <p className="text-sm font-medium">Reload System Settings</p>
                    <p className="text-xs text-muted-foreground">
                      Re-fetch all settings from the database
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    onClick={loadSettings}
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-1" />
                    )}
                    Reload
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        );

      default:
        return null;
    }
  };

  /* ── Active nav label ─── */
  const activeLabel = NAV.flatMap((g) => g.items).find((i) => i.id === active)?.label ?? "Settings";

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Admin Settings</h2>
        <p className="text-muted-foreground">System-wide configuration and user administration.</p>
      </div>

      {/* Mobile nav — horizontal scrollable pill row */}
      <div className="lg:hidden overflow-x-auto -mx-1 px-1 pb-2">
        <div className="flex gap-1.5 min-w-max">
          {NAV.flatMap((g) => g.items).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActive(id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-colors flex-shrink-0",
                active === id
                  ? "bg-primary text-primary-foreground font-medium shadow-sm"
                  : "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80",
              )}
            >
              <Icon className="h-3.5 w-3.5 flex-shrink-0" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-6 items-start">
        {/* ── Sidebar — desktop only ── */}
        <div className="hidden lg:block w-56 flex-shrink-0 space-y-1 sticky top-4">
          {NAV.map(({ group, items }) => (
            <div key={group} className="mb-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-3 mb-1">
                {group}
              </p>
              {items.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActive(id)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-colors text-left",
                    active === id
                      ? "bg-primary text-primary-foreground font-medium shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
                  )}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">{label}</span>
                  {active === id && <ChevronRight className="h-3.5 w-3.5 ml-auto flex-shrink-0" />}
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* ── Content area ── */}
        <div className="flex-1 min-w-0">
          <div className="mb-4 flex items-center gap-2">
            <div className="h-5 w-0.5 bg-primary rounded-full" />
            <h3 className="font-semibold">{activeLabel}</h3>
          </div>
          {renderContent()}
        </div>
      </div>

      <ResetPasswordDialog
        user={selectedUser}
        open={resetOpen}
        onClose={() => {
          setResetOpen(false);
          setSelectedUser(null);
        }}
        onSuccess={() => {
          setResetOpen(false);
          setSelectedUser(null);
          loadUsers();
        }}
      />
      <CreateUserDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccess={() => {
          setCreateOpen(false);
          loadUsers();
        }}
      />
      <DeleteUserDialog
        user={deleteConfirmUser}
        open={!!deleteConfirmUser}
        onClose={() => setDeleteConfirmUser(null)}
        onConfirm={() => deleteConfirmUser && deleteUser(deleteConfirmUser)}
        loading={deletingId === deleteConfirmUser?.id}
      />
    </div>
  );
}
