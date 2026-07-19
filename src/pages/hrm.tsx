import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Briefcase,
  Plus,
  Search,
  Loader2,
  MoreHorizontal,
  Pencil,
  Trash2,
  Mail,
  Phone,
  MapPin,
  Building,
  Calendar,
  Banknote,
  UserCheck,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Users,
  ChevronDown,
  ClipboardList,
  BarChart3,
  FileText,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { customFetch } from "@/workspace/api-client-react";
import { GhanaRegionPicker } from "@/components/ghana-region-picker";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const GHS = (v: number) =>
  `₵${Number(v).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ─── Types ────────────────────────────────────────────────────────────────────
type Employee = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  department: string | null;
  jobTitle: string | null;
  city: string | null;
  address: string | null;
  status: string;
  hireDate: string | null;
  salary: string | null;
  createdAt: string;
};
type AttendanceRow = {
  id: string;
  employeeId: string;
  employeeName: string | null;
  department: string | null;
  date: string;
  clockIn: string | null;
  clockOut: string | null;
  status: string;
  notes: string | null;
};
type LeaveRow = {
  id: string;
  employeeId: string;
  employeeName: string | null;
  department: string | null;
  type: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string | null;
  status: string;
  approvedBy: string | null;
  createdAt: string;
};
type PayrollRow = {
  id: string;
  employeeId: string;
  employeeName: string | null;
  department: string | null;
  month: string;
  basicSalary: string;
  allowances: string;
  grossPay: string;
  ssnit: string;
  tax: string;
  otherDeductions: string;
  netPay: string;
  status: string;
  notes: string | null;
};
type Department = {
  id: number;
  name: string;
  description: string | null;
  headName: string | null;
  location: string | null;
  budget: string | null;
  employeeCount: number;
  createdAt: string;
};
type ResourceId = string | number;

// ─── Constants ────────────────────────────────────────────────────────────────
const DEPARTMENTS = [
  "Management",
  "Sales",
  "Finance",
  "IT",
  "Operations",
  "Marketing",
  "HR",
  "Logistics",
  "Support",
  "Other",
];
const LEAVE_TYPES = ["Annual", "Sick", "Maternity", "Paternity", "Study", "Emergency", "Unpaid"];
const ATTENDANCE_STATUSES = ["present", "absent", "late", "half-day", "remote"];
const PAYROLL_MONTHS = Array.from({ length: 12 }, (_, i) =>
  new Date(2025, i).toLocaleString("en-GH", { month: "long", year: "numeric" }),
);

const statusBadge = (s: string) => {
  const map: Record<string, string> = {
    active: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 border-0",
    inactive: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-0",
    terminated: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-0",
    present: "bg-green-100 text-green-700 border-0",
    absent: "bg-red-100 text-red-700 border-0",
    late: "bg-amber-100 text-amber-700 border-0",
    "half-day": "bg-sky-100 text-sky-700 border-0",
    remote: "bg-violet-100 text-violet-700 border-0",
    pending: "bg-amber-100 text-amber-700 border-0",
    approved: "bg-green-100 text-green-700 border-0",
    rejected: "bg-red-100 text-red-700 border-0",
    draft: "bg-muted text-muted-foreground border-0",
    processed: "bg-sky-100 text-sky-700 border-0",
    paid: "bg-green-100 text-green-700 border-0",
  };
  return map[s] ?? "bg-muted text-muted-foreground border-0";
};

// ─── Employee Form ────────────────────────────────────────────────────────────
function EmployeeForm({
  initial,
  onSave,
  onCancel,
  isPending,
}: {
  initial?: Partial<Employee>;
  onSave: (d: Omit<Employee, "id" | "createdAt">) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [department, setDepartment] = useState(initial?.department ?? "");
  const [jobTitle, setJobTitle] = useState(initial?.jobTitle ?? "");
  const [city, setCity] = useState(initial?.city ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [status, setStatus] = useState(initial?.status ?? "active");
  const [hireDate, setHireDate] = useState(initial?.hireDate ?? "");
  const [salary, setSalary] = useState(initial?.salary ?? "");

  const emailValid = !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const phoneValid = !phone || /^[\+0-9\s\-\(\)]{7,20}$/.test(phone);
  const salaryValid = !salary || (!isNaN(Number(salary)) && Number(salary) >= 0);
  const canSave = name.trim().length >= 2 && emailValid && phoneValid && salaryValid;

  return (
    <div className="space-y-4 pt-1 max-h-[70vh] overflow-y-auto pr-1">
      <div>
        <label className="text-sm font-medium block mb-1.5">Full Name *</label>
        <Input
          id="hrm-emp-name"
          name="name"
          placeholder="Kofi Mensah"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-[20px]"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium block mb-1.5">Email</label>
          <Input
            id="hrm-emp-email"
            name="email"
            placeholder="kofi@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={cn(
              "rounded-[20px]",
              email && !emailValid && "border-destructive focus-visible:ring-destructive",
            )}
          />
          {email && !emailValid && (
            <p className="text-xs text-destructive mt-1">Enter a valid email address</p>
          )}
        </div>
        <div>
          <label className="text-sm font-medium block mb-1.5">Phone</label>
          <Input
            id="hrm-emp-phone"
            name="phone"
            placeholder="+233 20 000 0000"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={cn(
              "rounded-[20px]",
              phone && !phoneValid && "border-destructive focus-visible:ring-destructive",
            )}
          />
          {phone && !phoneValid && (
            <p className="text-xs text-destructive mt-1">Enter a valid phone number</p>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium block mb-1.5">Department</label>
          <Select
            value={department || "__none"}
            onValueChange={(v) => setDepartment(v === "__none" ? "" : v)}
          >
            <SelectTrigger className="rounded-[20px]">
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">
                <span className="text-muted-foreground">None</span>
              </SelectItem>
              {DEPARTMENTS.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-sm font-medium block mb-1.5">Job Title</label>
          <Input
            id="hrm-emp-job-title"
            name="jobTitle"
            placeholder="Sales Manager"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            className="rounded-[20px]"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium block mb-1.5">Hire Date</label>
          <Input
            id="hrm-emp-hire-date"
            name="hireDate"
            type="date"
            value={hireDate}
            onChange={(e) => setHireDate(e.target.value)}
            className="rounded-[20px]"
          />
        </div>
        <div>
          <label className="text-sm font-medium block mb-1.5">Salary (GHS ₵)</label>
          <Input
            id="hrm-emp-salary"
            name="salary"
            placeholder="5000"
            value={salary}
            onChange={(e) => setSalary(e.target.value)}
            className={cn(
              "rounded-[20px]",
              salary && !salaryValid && "border-destructive focus-visible:ring-destructive",
            )}
          />
          {salary && !salaryValid && (
            <p className="text-xs text-destructive mt-1">Enter a valid positive number</p>
          )}
        </div>
      </div>
      <div>
        <label className="text-sm font-medium block mb-1.5 flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
          City / Region
        </label>
        <GhanaRegionPicker value={city} onChange={setCity} />
      </div>
      <div>
        <label className="text-sm font-medium block mb-1.5">Street Address</label>
        <Input
          id="hrm-emp-address"
          name="address"
          placeholder="5 Ring Road, Kumasi"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="rounded-[20px]"
        />
      </div>
      <div>
        <label className="text-sm font-medium block mb-1.5">Status</label>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="rounded-[20px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="terminated">Terminated</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex justify-end gap-2 pt-2 sticky bottom-0 bg-background pb-1">
        <Button variant="outline" className="rounded-full" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          className="rounded-full"
          disabled={!canSave || isPending}
          onClick={() =>
            onSave({
              name,
              status,
              email: email || null,
              phone: phone || null,
              department: department || null,
              jobTitle: jobTitle || null,
              city: city || null,
              address: address || null,
              hireDate: hireDate || null,
              salary: salary || null,
            })
          }
        >
          {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save Employee
        </Button>
      </div>
    </div>
  );
}

// ─── Attendance Form ──────────────────────────────────────────────────────────
function AttendanceForm({
  employees,
  initial,
  onSave,
  onCancel,
  isPending,
}: {
  employees: Employee[];
  initial?: Partial<AttendanceRow>;
  onSave: (d: any) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [employeeId, setEmployeeId] = useState(
    initial?.employeeId ? String(initial.employeeId) : "",
  );
  const [date, setDate] = useState(initial?.date ?? new Date().toISOString().split("T")[0]);
  const [clockIn, setClockIn] = useState(initial?.clockIn ?? "");
  const [clockOut, setClockOut] = useState(initial?.clockOut ?? "");
  const [status, setStatus] = useState(initial?.status ?? "present");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  return (
    <div className="space-y-4 pt-1">
      <div>
        <label className="text-sm font-medium block mb-1.5">Employee *</label>
        <Select value={employeeId} onValueChange={setEmployeeId}>
          <SelectTrigger className="rounded-[20px]">
            <SelectValue placeholder="Select employee…" />
          </SelectTrigger>
          <SelectContent>
            {employees.map((e) => (
              <SelectItem key={e.id} value={String(e.id)}>
                {e.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium block mb-1.5">Date *</label>
          <Input
            id="att-date"
            name="date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-[20px]"
          />
        </div>
        <div>
          <label className="text-sm font-medium block mb-1.5">Status</label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="rounded-[20px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ATTENDANCE_STATUSES.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium block mb-1.5">Clock In</label>
          <Input
            id="att-clock-in"
            name="clockIn"
            type="time"
            value={clockIn}
            onChange={(e) => setClockIn(e.target.value)}
            className="rounded-[20px]"
          />
        </div>
        <div>
          <label className="text-sm font-medium block mb-1.5">Clock Out</label>
          <Input
            id="att-clock-out"
            name="clockOut"
            type="time"
            value={clockOut}
            onChange={(e) => setClockOut(e.target.value)}
            className="rounded-[20px]"
          />
        </div>
      </div>
      <div>
        <label className="text-sm font-medium block mb-1.5">Notes</label>
        <Input
          id="att-notes"
          name="notes"
          placeholder="Optional notes…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="rounded-[20px]"
        />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" className="rounded-full" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          className="rounded-full"
          disabled={!employeeId || !date || isPending}
          onClick={() =>
            onSave({
              employeeId,
              date,
              clockIn: clockIn || null,
              clockOut: clockOut || null,
              status,
              notes: notes || null,
            })
          }
        >
          {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save Record
        </Button>
      </div>
    </div>
  );
}

// ─── Leave Form ───────────────────────────────────────────────────────────────
function LeaveForm({
  employees,
  initial,
  onSave,
  onCancel,
  isPending,
}: {
  employees: Employee[];
  initial?: Partial<LeaveRow>;
  onSave: (d: any) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [employeeId, setEmployeeId] = useState(
    initial?.employeeId ? String(initial.employeeId) : "",
  );
  const [type, setType] = useState(initial?.type ?? "Annual");
  const [startDate, setStartDate] = useState(initial?.startDate ?? "");
  const [endDate, setEndDate] = useState(initial?.endDate ?? "");
  const [reason, setReason] = useState(initial?.reason ?? "");

  const calcDays = () => {
    if (!startDate || !endDate) return 1;
    const d =
      Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1;
    return Math.max(1, d);
  };

  return (
    <div className="space-y-4 pt-1">
      <div>
        <label className="text-sm font-medium block mb-1.5">Employee *</label>
        <Select value={employeeId} onValueChange={setEmployeeId}>
          <SelectTrigger className="rounded-[20px]">
            <SelectValue placeholder="Select employee…" />
          </SelectTrigger>
          <SelectContent>
            {employees.map((e) => (
              <SelectItem key={e.id} value={String(e.id)}>
                {e.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium block mb-1.5">Leave Type</label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="rounded-[20px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LEAVE_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col justify-center">
          <label className="text-xs text-muted-foreground">Duration</label>
          <p className="text-lg font-bold">
            {calcDays()} day{calcDays() !== 1 ? "s" : ""}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium block mb-1.5">Start Date *</label>
          <Input
            id="leave-start-date"
            name="startDate"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-[20px]"
          />
        </div>
        <div>
          <label className="text-sm font-medium block mb-1.5">End Date *</label>
          <Input
            id="leave-end-date"
            name="endDate"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-[20px]"
          />
        </div>
      </div>
      <div>
        <label className="text-sm font-medium block mb-1.5">Reason</label>
        <Input
          id="leave-reason"
          name="reason"
          placeholder="Brief reason for leave…"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="rounded-[20px]"
        />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" className="rounded-full" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          className="rounded-full"
          disabled={!employeeId || !startDate || !endDate || isPending}
          onClick={() =>
            onSave({
              employeeId,
              type,
              startDate,
              endDate,
              days: calcDays(),
              reason: reason || null,
            })
          }
        >
          {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Submit Request
        </Button>
      </div>
    </div>
  );
}

// ─── Payroll Form ─────────────────────────────────────────────────────────────
function PayrollForm({
  employees,
  initial,
  onSave,
  onCancel,
  isPending,
}: {
  employees: Employee[];
  initial?: Partial<PayrollRow>;
  onSave: (d: any) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [employeeId, setEmployeeId] = useState(
    initial?.employeeId ? String(initial.employeeId) : "",
  );
  const [month, setMonth] = useState(initial?.month ?? currentMonth);
  const [basicSalary, setBasicSalary] = useState(initial?.basicSalary ?? "");
  const [allowances, setAllowances] = useState(initial?.allowances ?? "0");
  const [ssnit, setSsnit] = useState(initial?.ssnit ?? "0");
  const [tax, setTax] = useState(initial?.tax ?? "0");
  const [otherDeductions, setOtherDeductions] = useState(initial?.otherDeductions ?? "0");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const basic = parseFloat(basicSalary) || 0;
  const allow = parseFloat(allowances) || 0;
  const gross = basic + allow;
  const ssnitAmt = parseFloat(ssnit) || 0;
  const taxAmt = parseFloat(tax) || 0;
  const other = parseFloat(otherDeductions) || 0;
  const net = gross - ssnitAmt - taxAmt - other;

  const emp = employees.find((e) => String(e.id) === employeeId);
  useEffect(() => {
    if (emp?.salary && !initial?.basicSalary) setBasicSalary(emp.salary);
  }, [emp]);

  return (
    <div className="space-y-4 pt-1 max-h-[75vh] overflow-y-auto pr-1">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium block mb-1.5">Employee *</label>
          <Select value={employeeId} onValueChange={setEmployeeId}>
            <SelectTrigger className="rounded-[20px]">
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              {employees.map((e) => (
                <SelectItem key={e.id} value={String(e.id)}>
                  {e.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-sm font-medium block mb-1.5">Pay Period (Month)</label>
          <Input
            id="payroll-month"
            name="month"
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded-[20px]"
          />
        </div>
      </div>
      <div className="bg-muted/30 rounded-2xl p-3 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Earnings
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium block mb-1">Basic Salary (₵)</label>
            <Input
              id="payroll-basic-salary"
              name="basicSalary"
              type="number"
              placeholder="0.00"
              value={basicSalary}
              onChange={(e) => setBasicSalary(e.target.value)}
              className="rounded-[20px]"
            />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1">Allowances (₵)</label>
            <Input
              id="payroll-allowances"
              name="allowances"
              type="number"
              placeholder="0.00"
              value={allowances}
              onChange={(e) => setAllowances(e.target.value)}
              className="rounded-[20px]"
            />
          </div>
        </div>
        <div className="flex justify-between text-sm font-semibold border-t pt-2">
          <span>Gross Pay</span>
          <span className="text-primary">{GHS(gross)}</span>
        </div>
      </div>
      <div className="bg-muted/30 rounded-2xl p-3 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Deductions
        </p>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-medium block mb-1">SSNIT (₵)</label>
            <Input
              id="payroll-ssnit"
              name="ssnit"
              type="number"
              placeholder="0.00"
              value={ssnit}
              onChange={(e) => setSsnit(e.target.value)}
              className="rounded-[20px]"
            />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1">Tax (₵)</label>
            <Input
              id="payroll-tax"
              name="tax"
              type="number"
              placeholder="0.00"
              value={tax}
              onChange={(e) => setTax(e.target.value)}
              className="rounded-[20px]"
            />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1">Other (₵)</label>
            <Input
              id="payroll-other-deductions"
              name="otherDeductions"
              type="number"
              placeholder="0.00"
              value={otherDeductions}
              onChange={(e) => setOtherDeductions(e.target.value)}
              className="rounded-[20px]"
            />
          </div>
        </div>
      </div>
      <div
        className={cn(
          "flex justify-between text-lg font-bold px-3 py-2 rounded-2xl",
          net >= 0
            ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300"
            : "bg-red-50 text-red-700",
        )}
      >
        <span>Net Pay</span>
        <span>{GHS(net)}</span>
      </div>
      <div>
        <label className="text-sm font-medium block mb-1.5">Notes</label>
        <Input
          id="payroll-notes"
          name="notes"
          placeholder="Optional notes…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="rounded-[20px]"
        />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" className="rounded-full" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          className="rounded-full"
          disabled={!employeeId || !month || !basicSalary || isPending}
          onClick={() =>
            onSave({
              employeeId,
              month,
              basicSalary: basic,
              allowances: allow,
              ssnit: ssnitAmt,
              tax: taxAmt,
              otherDeductions: other,
              notes: notes || null,
            })
          }
        >
          {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save Payroll
        </Button>
      </div>
    </div>
  );
}

// ─── Department Form ──────────────────────────────────────────────────────────
function DepartmentForm({
  initial,
  onSave,
  onCancel,
  isPending,
}: {
  initial?: Partial<Department>;
  onSave: (d: any) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [headName, setHeadName] = useState(initial?.headName ?? "");
  const [location, setLocation] = useState(initial?.location ?? "");
  const [budget, setBudget] = useState(initial?.budget ?? "");
  return (
    <div className="space-y-4 pt-1">
      <div>
        <label className="text-sm font-medium block mb-1.5">Department Name *</label>
        <Input
          id="dept-name"
          name="name"
          placeholder="e.g. Sales"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-[20px]"
        />
      </div>
      <div>
        <label className="text-sm font-medium block mb-1.5">Description</label>
        <Input
          id="dept-description"
          name="description"
          placeholder="Brief description…"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="rounded-[20px]"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium block mb-1.5">Head / Manager</label>
          <Input
            id="dept-head-name"
            name="headName"
            placeholder="e.g. Ama Boateng"
            value={headName}
            onChange={(e) => setHeadName(e.target.value)}
            className="rounded-[20px]"
          />
        </div>
        <div>
          <label className="text-sm font-medium block mb-1.5">Location</label>
          <Input
            id="dept-location"
            name="location"
            placeholder="e.g. Accra HQ"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="rounded-[20px]"
          />
        </div>
      </div>
      <div>
        <label className="text-sm font-medium block mb-1.5">Annual Budget (₵)</label>
        <Input
          id="dept-budget"
          name="budget"
          type="number"
          placeholder="0.00"
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
          className="rounded-[20px]"
        />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" className="rounded-full" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          className="rounded-full"
          disabled={name.trim().length < 2 || isPending}
          onClick={() =>
            onSave({
              name,
              description: description || null,
              headName: headName || null,
              location: location || null,
              budget: budget || null,
            })
          }
        >
          {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save Department
        </Button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function HRMHub() {
  const [tab, setTab] = useState("employees");
  const [search, setSearch] = useState("");
  const [dSearch, setDSearch] = useState("");
  const [createOpen, setCreateOpen] = useState<string | false>(false);
  const [editing, setEditing] = useState<any>(null);
  const [deletingId, setDeletingId] = useState<{ id: ResourceId; resource: string } | null>(null);
  const [leaveFilter, setLeaveFilter] = useState("all");
  const [attMonthFilter, setAttMonthFilter] = useState(new Date().toISOString().slice(0, 7));
  const { toast } = useToast();
  const qc = useQueryClient();

  useEffect(() => {
    const t = setTimeout(() => setDSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const empQ = useQuery<{ data: Employee[]; total: number }>({
    queryKey: ["employees", dSearch],
    queryFn: () =>
      customFetch(
        `/api/employees?limit=100${dSearch ? `&search=${encodeURIComponent(dSearch)}` : ""}`,
      ),
  });
  const attQ = useQuery<{ data: AttendanceRow[]; total: number }>({
    queryKey: ["attendance", attMonthFilter],
    queryFn: () => customFetch(`/api/attendance?limit=100&month=${attMonthFilter}`),
  });
  const leaveQ = useQuery<{ data: LeaveRow[]; total: number }>({
    queryKey: ["leave", leaveFilter],
    queryFn: () =>
      customFetch(`/api/leave?limit=100${leaveFilter !== "all" ? `&status=${leaveFilter}` : ""}`),
  });
  const payQ = useQuery<{ data: PayrollRow[]; total: number }>({
    queryKey: ["payroll"],
    queryFn: () => customFetch("/api/payroll?limit=100"),
  });
  const deptQ = useQuery<{ data: Department[]; total: number }>({
    queryKey: ["departments"],
    queryFn: () => customFetch("/api/departments"),
  });

  const allEmployees = empQ.data?.data ?? [];

  const inv = (key: string) => qc.invalidateQueries({ queryKey: [key] });

  // Generic mutations
  const createMut = useMutation({
    mutationFn: ({ resource, body }: { resource: string; body: any }) =>
      customFetch(`/api/${resource}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: (_, { resource }) => {
      inv(resource === "leave" ? "leave" : resource);
      setCreateOpen(false);
      toast({ title: "Created successfully" });
    },
    onError: () => toast({ variant: "destructive", title: "Failed to create" }),
  });
  const updateMut = useMutation({
    mutationFn: ({ resource, id, body }: { resource: string; id: ResourceId; body: any }) =>
      customFetch(`/api/${resource}/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: (_, { resource }) => {
      inv(resource);
      setEditing(null);
      toast({ title: "Updated successfully" });
    },
    onError: () => toast({ variant: "destructive", title: "Failed to update" }),
  });
  const deleteMut = useMutation({
    mutationFn: ({ resource, id }: { resource: string; id: ResourceId }) =>
      customFetch(`/api/${resource}/${id}`, { method: "DELETE" }),
    onSuccess: (_, { resource }) => {
      inv(resource);
      setDeletingId(null);
      toast({ title: "Deleted" });
    },
    onError: () => toast({ variant: "destructive", title: "Failed to delete" }),
  });

  const leaveStatusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      customFetch(`/api/leave/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      inv("leave");
      toast({ title: "Leave request updated" });
    },
  });
  const payrollStatusMut = useMutation({
    mutationFn: ({ id, status, row }: { id: string; status: string; row: PayrollRow }) =>
      customFetch(`/api/payroll/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...row, status }),
      }),
    onSuccess: () => {
      inv("payroll");
      toast({ title: "Payroll status updated" });
    },
  });

  const empStats =
    allEmployees.length > 0
      ? {
          total: empQ.data!.total,
          active: allEmployees.filter((e) => e.status === "active").length,
          departments: new Set(allEmployees.map((e) => e.department).filter(Boolean)).size,
          totalPayroll: allEmployees.reduce((s, e) => s + Number(e.salary || 0), 0),
        }
      : null;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">HRM Hub</h2>
          <p className="text-muted-foreground">
            Employees · Attendance · Leave · Payroll · Departments
          </p>
        </div>
        <Button className="rounded-full gap-2" onClick={() => setCreateOpen(tab)}>
          <Plus className="h-4 w-4" />
          {tab === "employees"
            ? "Add Employee"
            : tab === "attendance"
              ? "Log Attendance"
              : tab === "leave"
                ? "New Leave Request"
                : tab === "payroll"
                  ? "Run Payroll"
                  : "Add Department"}
        </Button>
      </div>

      {/* Stats row */}
      {empStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            {
              label: "Total Staff",
              value: empStats.total,
              icon: Users,
              color: "text-primary",
              bg: "bg-primary/10",
            },
            {
              label: "Active",
              value: empStats.active,
              icon: UserCheck,
              color: "text-green-600",
              bg: "bg-green-500/10",
            },
            {
              label: "Departments",
              value: empStats.departments,
              icon: Building,
              color: "text-sky-600",
              bg: "bg-sky-500/10",
            },
            {
              label: "Monthly Payroll",
              value: GHS(empStats.totalPayroll),
              icon: Banknote,
              color: "text-violet-600",
              bg: "bg-violet-500/10",
            },
          ].map((s) => (
            <Card key={s.label} className="overflow-hidden">
              <CardContent className="pt-4 pb-3 flex items-center gap-3">
                <div
                  className={cn(
                    "h-10 w-10 rounded-xl flex items-center justify-center shrink-0",
                    s.bg,
                  )}
                >
                  <s.icon className={cn("h-5 w-5", s.color)} />
                </div>
                <div>
                  <p className="text-xl font-bold leading-tight">{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <div className="overflow-x-auto -mx-1 px-1 pb-1">
          <TabsList className="rounded-full p-1 h-10 gap-1 flex-nowrap w-max min-w-full">
            {[
              { value: "employees", label: "Employees", icon: Users },
              { value: "attendance", label: "Attendance", icon: Clock },
              { value: "leave", label: "Leave", icon: ClipboardList },
              { value: "payroll", label: "Payroll", icon: Banknote },
              { value: "departments", label: "Departments", icon: Building },
            ].map((t) => (
              <TabsTrigger
                key={t.value}
                value={t.value}
                className="rounded-full gap-1.5 text-xs px-3 flex-shrink-0"
              >
                <t.icon className="h-3.5 w-3.5" />
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* ── Employees ── */}
        <TabsContent value="employees" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3 border-b">
              <div className="relative w-full max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="hrm-search"
                  name="search"
                  placeholder="Search employees…"
                  className="pl-9 rounded-full bg-muted/50 border-transparent"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table className="min-w-[700px]">
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Department / Title</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>City</TableHead>
                    <TableHead>Hired</TableHead>
                    <TableHead>Salary</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {empQ.isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 8 }).map((_, j) => (
                          <TableCell key={j}>
                            <div className="h-4 w-20 bg-muted animate-pulse rounded" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : allEmployees.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="h-48 text-center">
                        <div className="flex flex-col items-center gap-3 text-muted-foreground">
                          <Briefcase className="h-10 w-10 opacity-30" />
                          <p className="font-medium text-foreground">No employees yet</p>
                          <Button
                            variant="outline"
                            className="rounded-full"
                            onClick={() => setCreateOpen("employees")}
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Add Employee
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    allEmployees.map((emp) => (
                      <TableRow key={emp.id} className="hover:bg-muted/40">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm shrink-0">
                              {emp.name.charAt(0).toUpperCase()}
                            </div>
                            <span className="font-medium">{emp.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {emp.department && <div className="font-medium">{emp.department}</div>}
                            {emp.jobTitle && (
                              <div className="text-muted-foreground text-xs">{emp.jobTitle}</div>
                            )}
                            {!emp.department && !emp.jobTitle && (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm space-y-0.5">
                            {emp.email && (
                              <div className="flex items-center">
                                <Mail className="h-3 w-3 mr-1.5 text-muted-foreground" />
                                {emp.email}
                              </div>
                            )}
                            {emp.phone && (
                              <div className="flex items-center text-muted-foreground">
                                <Phone className="h-3 w-3 mr-1.5" />
                                {emp.phone}
                              </div>
                            )}
                            {!emp.email && !emp.phone && (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {emp.city ? (
                            <div className="flex items-center gap-1 text-sm">
                              <MapPin className="h-3 w-3 text-muted-foreground" />
                              {emp.city}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {emp.hireDate ? (
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {emp.hireDate}
                            </div>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {emp.salary ? (
                            <span className="font-medium">
                              ₵{Number(emp.salary).toLocaleString()}
                            </span>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge className={statusBadge(emp.status)}>{emp.status}</Badge>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => setEditing({ ...emp, _resource: "employees" })}
                              >
                                <Pencil className="h-4 w-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setDeletingId({ id: emp.id, resource: "employees" })}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Remove
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Attendance ── */}
        <TabsContent value="attendance" className="mt-4 space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-muted-foreground">Month</label>
              <Input
                id="att-month-filter"
                name="attMonthFilter"
                type="month"
                value={attMonthFilter}
                onChange={(e) => setAttMonthFilter(e.target.value)}
                className="rounded-full h-8 text-sm w-36"
              />
            </div>
            <div className="ml-auto flex gap-2 text-xs text-muted-foreground">
              {["present", "absent", "late", "half-day", "remote"].map((s) => (
                <span key={s} className="flex items-center gap-1">
                  <span
                    className={cn("h-2 w-2 rounded-full", {
                      "bg-green-500": s === "present",
                      "bg-red-500": s === "absent",
                      "bg-amber-500": s === "late",
                      "bg-sky-500": s === "half-day",
                      "bg-violet-500": s === "remote",
                    })}
                  />
                  {s}
                </span>
              ))}
            </div>
          </div>
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table className="min-w-[600px]">
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Clock In</TableHead>
                    <TableHead>Clock Out</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {attQ.isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 7 }).map((_, j) => (
                          <TableCell key={j}>
                            <div className="h-4 w-16 bg-muted animate-pulse rounded" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : (attQ.data?.data ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-40 text-center text-muted-foreground">
                        <Clock className="h-8 w-8 opacity-30 mx-auto mb-2" />
                        <p>No attendance records for this month</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    (attQ.data?.data ?? []).map((row) => (
                      <TableRow key={row.id} className="hover:bg-muted/40">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                              {(row.employeeName ?? "?").charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium text-sm">{row.employeeName}</p>
                              {row.department && (
                                <p className="text-xs text-muted-foreground">{row.department}</p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{row.date}</TableCell>
                        <TableCell className="text-sm font-mono">
                          {row.clockIn ?? <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-sm font-mono">
                          {row.clockOut ?? <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>
                          <Badge className={statusBadge(row.status)}>{row.status}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {row.notes ?? <span>—</span>}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full">
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => setEditing({ ...row, _resource: "attendance" })}
                              >
                                <Pencil className="h-4 w-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() =>
                                  setDeletingId({ id: row.id, resource: "attendance" })
                                }
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Leave Management ── */}
        <TabsContent value="leave" className="mt-4 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            {["all", "pending", "approved", "rejected"].map((f) => (
              <Button
                key={f}
                variant={leaveFilter === f ? "default" : "outline"}
                size="sm"
                className="rounded-full capitalize h-8"
                onClick={() => setLeaveFilter(f)}
              >
                {f}
              </Button>
            ))}
            <div className="ml-auto text-sm text-muted-foreground">
              {leaveQ.data?.total ?? 0} request{(leaveQ.data?.total ?? 0) !== 1 ? "s" : ""}
            </div>
          </div>
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table className="min-w-[600px]">
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Days</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-24">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leaveQ.isLoading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 7 }).map((_, j) => (
                          <TableCell key={j}>
                            <div className="h-4 w-16 bg-muted animate-pulse rounded" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : (leaveQ.data?.data ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-40 text-center text-muted-foreground">
                        <ClipboardList className="h-8 w-8 opacity-30 mx-auto mb-2" />
                        <p>No leave requests found</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    (leaveQ.data?.data ?? []).map((row) => (
                      <TableRow key={row.id} className="hover:bg-muted/40">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                              {(row.employeeName ?? "?").charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium text-sm">{row.employeeName}</p>
                              {row.department && (
                                <p className="text-xs text-muted-foreground">{row.department}</p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {row.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          <div>{row.startDate}</div>
                          <div className="text-muted-foreground text-xs">to {row.endDate}</div>
                        </TableCell>
                        <TableCell className="text-sm font-semibold">{row.days}d</TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[120px] truncate">
                          {row.reason ?? <span>—</span>}
                        </TableCell>
                        <TableCell>
                          <Badge className={statusBadge(row.status)}>{row.status}</Badge>
                        </TableCell>
                        <TableCell>
                          {row.status === "pending" ? (
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-green-600 hover:bg-green-50"
                                title="Approve"
                                onClick={() =>
                                  leaveStatusMut.mutate({ id: row.id, status: "approved" })
                                }
                              >
                                <ThumbsUp className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-red-500 hover:bg-red-50"
                                title="Reject"
                                onClick={() =>
                                  leaveStatusMut.mutate({ id: row.id, status: "rejected" })
                                }
                              >
                                <ThumbsDown className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0"
                                title="Edit"
                                onClick={() => setEditing({ ...row, _resource: "leave" })}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 rounded-full"
                                >
                                  <MoreHorizontal className="h-3.5 w-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() =>
                                    leaveStatusMut.mutate({ id: row.id, status: "pending" })
                                  }
                                >
                                  <AlertCircle className="h-4 w-4 mr-2" />
                                  Set Pending
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => setDeletingId({ id: row.id, resource: "leave" })}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Payroll ── */}
        <TabsContent value="payroll" className="mt-4 space-y-4">
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table className="min-w-[720px]">
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Month</TableHead>
                    <TableHead>Basic</TableHead>
                    <TableHead>Allowances</TableHead>
                    <TableHead>Gross</TableHead>
                    <TableHead>Deductions</TableHead>
                    <TableHead>Net Pay</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payQ.isLoading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 9 }).map((_, j) => (
                          <TableCell key={j}>
                            <div className="h-4 w-16 bg-muted animate-pulse rounded" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : (payQ.data?.data ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="h-40 text-center text-muted-foreground">
                        <Banknote className="h-8 w-8 opacity-30 mx-auto mb-2" />
                        <p>No payroll records yet</p>
                        <Button
                          variant="outline"
                          className="rounded-full mt-2"
                          onClick={() => setCreateOpen("payroll")}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Run Payroll
                        </Button>
                      </TableCell>
                    </TableRow>
                  ) : (
                    (payQ.data?.data ?? []).map((row) => (
                      <TableRow key={row.id} className="hover:bg-muted/40">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                              {(row.employeeName ?? "?").charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium text-sm">{row.employeeName}</p>
                              {row.department && (
                                <p className="text-xs text-muted-foreground">{row.department}</p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm font-medium">{row.month}</TableCell>
                        <TableCell className="text-sm">{GHS(Number(row.basicSalary))}</TableCell>
                        <TableCell className="text-sm text-green-600">
                          +{GHS(Number(row.allowances))}
                        </TableCell>
                        <TableCell className="text-sm font-semibold">
                          {GHS(Number(row.grossPay))}
                        </TableCell>
                        <TableCell className="text-sm text-red-500">
                          -{GHS(Number(row.ssnit) + Number(row.tax) + Number(row.otherDeductions))}
                        </TableCell>
                        <TableCell className="text-sm font-bold text-primary">
                          {GHS(Number(row.netPay))}
                        </TableCell>
                        <TableCell>
                          <Badge className={statusBadge(row.status)}>{row.status}</Badge>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full">
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {row.status === "draft" && (
                                <DropdownMenuItem
                                  onClick={() =>
                                    payrollStatusMut.mutate({
                                      id: row.id,
                                      status: "processed",
                                      row,
                                    })
                                  }
                                >
                                  <CheckCircle2 className="h-4 w-4 mr-2 text-sky-500" />
                                  Mark Processed
                                </DropdownMenuItem>
                              )}
                              {row.status === "processed" && (
                                <DropdownMenuItem
                                  onClick={() =>
                                    payrollStatusMut.mutate({ id: row.id, status: "paid", row })
                                  }
                                >
                                  <CheckCircle2 className="h-4 w-4 mr-2 text-green-500" />
                                  Mark Paid
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                onClick={() => setEditing({ ...row, _resource: "payroll" })}
                              >
                                <Pencil className="h-4 w-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setDeletingId({ id: row.id, resource: "payroll" })}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Departments ── */}
        <TabsContent value="departments" className="mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {deptQ.isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-36 rounded-2xl bg-muted animate-pulse" />
              ))
            ) : (deptQ.data?.data ?? []).length === 0 ? (
              <div className="col-span-3 h-48 flex flex-col items-center justify-center text-muted-foreground gap-3">
                <Building className="h-10 w-10 opacity-30" />
                <p className="font-medium text-foreground">No departments yet</p>
                <Button
                  variant="outline"
                  className="rounded-full"
                  onClick={() => setCreateOpen("departments")}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Department
                </Button>
              </div>
            ) : (
              (deptQ.data?.data ?? []).map((dept) => (
                <Card key={dept.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                        <Building className="h-5 w-5 text-primary" />
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full">
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => setEditing({ ...dept, _resource: "departments" })}
                          >
                            <Pencil className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeletingId({ id: dept.id, resource: "departments" })}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <h3 className="font-bold text-base mt-1">{dept.name}</h3>
                    {dept.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {dept.description}
                      </p>
                    )}
                    <div className="mt-3 grid grid-cols-2 gap-y-1 text-xs text-muted-foreground">
                      {dept.headName && (
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          Head: {dept.headName}
                        </span>
                      )}
                      {dept.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {dept.location}
                        </span>
                      )}
                      {dept.budget && (
                        <span className="flex items-center gap-1">
                          <Banknote className="h-3 w-3" />₵{Number(dept.budget).toLocaleString()}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {dept.employeeCount} staff
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Create Dialogs ── */}
      <Dialog
        open={createOpen === "employees"}
        onOpenChange={(o) => {
          if (!o) setCreateOpen(false);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Employee</DialogTitle>
          </DialogHeader>
          <EmployeeForm
            onSave={(d) => createMut.mutate({ resource: "employees", body: d })}
            onCancel={() => setCreateOpen(false)}
            isPending={createMut.isPending}
          />
        </DialogContent>
      </Dialog>
      <Dialog
        open={createOpen === "attendance"}
        onOpenChange={(o) => {
          if (!o) setCreateOpen(false);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Log Attendance</DialogTitle>
          </DialogHeader>
          <AttendanceForm
            employees={allEmployees}
            onSave={(d) => createMut.mutate({ resource: "attendance", body: d })}
            onCancel={() => setCreateOpen(false)}
            isPending={createMut.isPending}
          />
        </DialogContent>
      </Dialog>
      <Dialog
        open={createOpen === "leave"}
        onOpenChange={(o) => {
          if (!o) setCreateOpen(false);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Leave Request</DialogTitle>
          </DialogHeader>
          <LeaveForm
            employees={allEmployees}
            onSave={(d) => createMut.mutate({ resource: "leave", body: d })}
            onCancel={() => setCreateOpen(false)}
            isPending={createMut.isPending}
          />
        </DialogContent>
      </Dialog>
      <Dialog
        open={createOpen === "payroll"}
        onOpenChange={(o) => {
          if (!o) setCreateOpen(false);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Run Payroll</DialogTitle>
          </DialogHeader>
          <PayrollForm
            employees={allEmployees}
            onSave={(d) => createMut.mutate({ resource: "payroll", body: d })}
            onCancel={() => setCreateOpen(false)}
            isPending={createMut.isPending}
          />
        </DialogContent>
      </Dialog>
      <Dialog
        open={createOpen === "departments"}
        onOpenChange={(o) => {
          if (!o) setCreateOpen(false);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Department</DialogTitle>
          </DialogHeader>
          <DepartmentForm
            onSave={(d) => createMut.mutate({ resource: "departments", body: d })}
            onCancel={() => setCreateOpen(false)}
            isPending={createMut.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* ── Edit Dialogs ── */}
      <Dialog
        open={!!editing && editing._resource === "employees"}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Employee</DialogTitle>
          </DialogHeader>
          {editing && editing._resource === "employees" && (
            <EmployeeForm
              initial={editing}
              onSave={(d) => updateMut.mutate({ resource: "employees", id: editing.id, body: d })}
              onCancel={() => setEditing(null)}
              isPending={updateMut.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!editing && editing._resource === "attendance"}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Attendance</DialogTitle>
          </DialogHeader>
          {editing && editing._resource === "attendance" && (
            <AttendanceForm
              employees={allEmployees}
              initial={editing}
              onSave={(d) => updateMut.mutate({ resource: "attendance", id: editing.id, body: d })}
              onCancel={() => setEditing(null)}
              isPending={updateMut.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!editing && editing._resource === "leave"}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Leave Request</DialogTitle>
          </DialogHeader>
          {editing && editing._resource === "leave" && (
            <LeaveForm
              employees={allEmployees}
              initial={editing}
              onSave={(d) => updateMut.mutate({ resource: "leave", id: editing.id, body: d })}
              onCancel={() => setEditing(null)}
              isPending={updateMut.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!editing && editing._resource === "payroll"}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Payroll</DialogTitle>
          </DialogHeader>
          {editing && editing._resource === "payroll" && (
            <PayrollForm
              employees={allEmployees}
              initial={editing}
              onSave={(d) =>
                updateMut.mutate({
                  resource: "payroll",
                  id: editing.id,
                  body: { ...editing, ...d },
                })
              }
              onCancel={() => setEditing(null)}
              isPending={updateMut.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!editing && editing._resource === "departments"}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Department</DialogTitle>
          </DialogHeader>
          {editing && editing._resource === "departments" && (
            <DepartmentForm
              initial={editing}
              onSave={(d) => updateMut.mutate({ resource: "departments", id: editing.id, body: d })}
              onCancel={() => setEditing(null)}
              isPending={updateMut.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ── */}
      <AlertDialog
        open={deletingId !== null}
        onOpenChange={(o) => {
          if (!o) setDeletingId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Delete</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the record and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                deletingId && deleteMut.mutate({ resource: deletingId.resource, id: deletingId.id })
              }
              disabled={deleteMut.isPending}
            >
              {deleteMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
