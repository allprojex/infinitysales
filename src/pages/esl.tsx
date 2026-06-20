import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@/workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  Wifi, WifiOff, Battery, BatteryLow, AlertTriangle, RefreshCw,
  Plus, Trash2, Loader2, Usb, Bluetooth, Network, Zap, CheckCircle,
  Clock, ShoppingBag, Tag, Upload, Activity,
} from "lucide-react";

interface EslDevice {
  id: string;
  name: string;
  connectionType: "usb" | "bluetooth" | "network";
  ip?: string;
  macAddress?: string;
  status: "online" | "offline" | "syncing" | "error";
  batteryPct: number;
  lastSync: number | null;
  connectedAt: number;
  linkedProductName?: string;
  linkedProductSku?: string;
  shelfLabel?: string;
  firmwareVersion?: string;
  signalStrength?: number;
}

interface SyncEvent {
  id: string;
  deviceId: string;
  deviceName: string;
  productName: string;
  action: string;
  status: "success" | "failed" | "pending";
  initiatedBy: string;
  timestamp: number;
  details?: string;
}

const GHS = (v: number) =>
  new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" }).format(v);

const relTime = (ts: number | null) => {
  if (!ts) return "Never";
  const diff = Date.now() - ts;
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(ts).toLocaleDateString("en-GH");
};

function BrowserApiAlert({ type }: { type: "usb" | "bluetooth" }) {
  const supported =
    type === "usb" ? "usb" in navigator : "bluetooth" in navigator;
  if (supported) return null;
  return (
    <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
      <span>
        <strong>Web {type === "usb" ? "USB" : "Bluetooth"} not supported</strong> in this
        browser. Use Chrome or Edge on desktop to connect {type === "usb" ? "USB" : "Bluetooth"} ESL devices.
        Network-connected devices work in all browsers.
      </span>
    </div>
  );
}

function BatteryIcon({ pct }: { pct: number }) {
  if (pct <= 20)
    return <BatteryLow className="h-4 w-4 text-red-400" />;
  return <Battery className="h-4 w-4 text-emerald-400" />;
}

function StatusBadge({ status }: { status: EslDevice["status"] }) {
  const map: Record<string, { label: string; cls: string }> = {
    online: { label: "Online", cls: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
    offline: { label: "Offline", cls: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30" },
    syncing: { label: "Syncing…", cls: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
    error: { label: "Error", cls: "bg-red-500/20 text-red-400 border-red-500/30" },
  };
  const { label, cls } = map[status] ?? map.offline;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {status === "online" && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />}
      {status === "syncing" && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
      {label}
    </span>
  );
}

function ConnTypeIcon({ type }: { type: EslDevice["connectionType"] }) {
  if (type === "usb") return <Usb className="h-3.5 w-3.5" />;
  if (type === "bluetooth") return <Bluetooth className="h-3.5 w-3.5" />;
  return <Network className="h-3.5 w-3.5" />;
}

function ConnectDeviceDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "", connectionType: "network" as EslDevice["connectionType"],
    ip: "", macAddress: "", batteryPct: "100",
    linkedProductName: "", linkedProductSku: "", shelfLabel: "", firmwareVersion: "",
  });
  const { toast } = useToast();
  const qc = useQueryClient();

  const mut = useMutation({
    mutationFn: (data: object) => customFetch("/api/esl/devices", { method: "POST", body: JSON.stringify(data), headers: { "Content-Type": "application/json" } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["esl-devices"] });
      qc.invalidateQueries({ queryKey: ["esl-history"] });
      toast({ title: "Device registered", description: `${form.name} is now connected.` });
      setOpen(false);
      onSuccess();
    },
    onError: () => toast({ title: "Registration failed", variant: "destructive" }),
  });

  const usbSupported = "usb" in navigator;
  const btSupported = "bluetooth" in navigator;

  async function handleWebUsb() {
    if (!usbSupported) {
      toast({ title: "Web USB not supported", description: "Use Chrome or Edge on desktop.", variant: "destructive" });
      return;
    }
    try {
      const device = await (navigator as any).usb.requestDevice({ filters: [] });
      setForm(f => ({
        ...f,
        name: device.productName ?? `USB ESL ${device.serialNumber ?? ""}`,
        connectionType: "usb",
        macAddress: device.serialNumber ?? "",
      }));
    } catch {
      toast({ title: "No USB device selected", variant: "destructive" });
    }
  }

  async function handleBluetooth() {
    if (!btSupported) {
      toast({ title: "Web Bluetooth not supported", description: "Use Chrome or Edge on desktop.", variant: "destructive" });
      return;
    }
    try {
      const device = await (navigator as any).bluetooth.requestDevice({ acceptAllDevices: true });
      setForm(f => ({
        ...f,
        name: device.name ?? `BT ESL ${device.id?.slice(0, 6) ?? ""}`,
        connectionType: "bluetooth",
        macAddress: device.id ?? "",
      }));
    } catch {
      toast({ title: "No Bluetooth device selected", variant: "destructive" });
    }
  }

  const valid = form.name.trim().length >= 2;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 rounded-[20px] bg-emerald-600 hover:bg-emerald-700 text-white">
          <Plus className="h-4 w-4" /> Connect Device
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Register ESL Device</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div className="grid grid-cols-3 gap-2">
            <Button type="button" variant="outline" className="flex-col gap-1 h-14 text-xs rounded-xl" onClick={handleWebUsb}>
              <Usb className="h-4 w-4 text-sky-400" />
              Web USB
              {!usbSupported && <span className="text-[9px] text-amber-400">Unsupported</span>}
            </Button>
            <Button type="button" variant="outline" className="flex-col gap-1 h-14 text-xs rounded-xl" onClick={handleBluetooth}>
              <Bluetooth className="h-4 w-4 text-violet-400" />
              Bluetooth
              {!btSupported && <span className="text-[9px] text-amber-400">Unsupported</span>}
            </Button>
            <Button type="button" variant="outline" className="flex-col gap-1 h-14 text-xs rounded-xl"
              onClick={() => setForm(f => ({ ...f, connectionType: "network" }))}>
              <Network className="h-4 w-4 text-emerald-400" />
              Network
            </Button>
          </div>

          <div className="space-y-1">
            <Label>Device Name *</Label>
            <Input className="rounded-[20px]" placeholder="Shelf ESL – Aisle 3A"
              value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Connection Type</Label>
              <Select value={form.connectionType} onValueChange={v => setForm(f => ({ ...f, connectionType: v as EslDevice["connectionType"] }))}>
                <SelectTrigger className="rounded-[20px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="usb">USB</SelectItem>
                  <SelectItem value="bluetooth">Bluetooth</SelectItem>
                  <SelectItem value="network">Network</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Battery %</Label>
              <Input type="number" min={0} max={100} className="rounded-[20px]"
                value={form.batteryPct} onChange={e => setForm(f => ({ ...f, batteryPct: e.target.value }))} />
            </div>
          </div>

          {form.connectionType === "network" && (
            <div className="space-y-1">
              <Label>IP Address</Label>
              <Input className="rounded-[20px]" placeholder="192.168.1.101"
                value={form.ip} onChange={e => setForm(f => ({ ...f, ip: e.target.value }))} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Linked Product</Label>
              <Input className="rounded-[20px]" placeholder="Milo 400g"
                value={form.linkedProductName} onChange={e => setForm(f => ({ ...f, linkedProductName: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>SKU</Label>
              <Input className="rounded-[20px]" placeholder="MILO-400G"
                value={form.linkedProductSku} onChange={e => setForm(f => ({ ...f, linkedProductSku: e.target.value }))} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Shelf Label</Label>
              <Input className="rounded-[20px]" placeholder="A3 – Row 2"
                value={form.shelfLabel} onChange={e => setForm(f => ({ ...f, shelfLabel: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Firmware</Label>
              <Input className="rounded-[20px]" placeholder="v2.4.1"
                value={form.firmwareVersion} onChange={e => setForm(f => ({ ...f, firmwareVersion: e.target.value }))} />
            </div>
          </div>

          <Button disabled={!valid || mut.isPending} className="w-full rounded-[20px]" onClick={() => mut.mutate({
            ...form, batteryPct: Number(form.batteryPct),
          })}>
            {mut.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Registering…</> : "Register Device"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PushToEslDialog({ device }: { device: EslDevice }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    productName: device.linkedProductName ?? "",
    price: "", stock: "", promo: "", sku: device.linkedProductSku ?? "", category: "",
  });
  const { toast } = useToast();
  const qc = useQueryClient();

  const mut = useMutation({
    mutationFn: (data: object) => customFetch(`/api/esl/devices/${device.id}/push`, { method: "POST", body: JSON.stringify(data), headers: { "Content-Type": "application/json" } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["esl-devices"] });
      qc.invalidateQueries({ queryKey: ["esl-history"] });
      toast({ title: "Pushed to ESL", description: `${device.name} updated successfully.` });
      setOpen(false);
    },
    onError: () => toast({ title: "Push failed", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5 rounded-xl text-xs h-7 bg-blue-600 hover:bg-blue-700 text-white"
          disabled={device.status === "offline" || device.status === "error"}>
          <Upload className="h-3 w-3" /> Push Update
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Push to {device.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="space-y-1">
            <Label>Product Name</Label>
            <Input className="rounded-[20px]" value={form.productName}
              onChange={e => setForm(f => ({ ...f, productName: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Price (GHS)</Label>
              <Input type="number" className="rounded-[20px]" placeholder="0.00"
                value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Stock Qty</Label>
              <Input type="number" className="rounded-[20px]" placeholder="0"
                value={form.stock} onChange={e => setForm(f => ({ ...f, stock: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>SKU</Label>
              <Input className="rounded-[20px]" value={form.sku}
                onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Category</Label>
              <Input className="rounded-[20px]" placeholder="Beverages"
                value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Promotion Text</Label>
            <Input className="rounded-[20px]" placeholder="e.g. 10% OFF – Ends Friday"
              value={form.promo} onChange={e => setForm(f => ({ ...f, promo: e.target.value }))} />
          </div>
          <Button disabled={mut.isPending} className="w-full rounded-[20px] bg-blue-600 hover:bg-blue-700" onClick={() => mut.mutate({
            productName: form.productName, price: form.price ? Number(form.price) : undefined,
            stock: form.stock ? Number(form.stock) : undefined, promo: form.promo || undefined,
            sku: form.sku || undefined, category: form.category || undefined,
          })}>
            {mut.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Pushing…</> : <><Zap className="h-4 w-4 mr-2" />Push to ESL</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DeviceCard({ device, onSync, onRemove }: {
  device: EslDevice;
  onSync: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const isSyncing = device.status === "syncing";

  return (
    <Card className="border border-white/10 bg-white/5 backdrop-blur-sm rounded-2xl">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-sm font-semibold truncate">{device.name}</span>
              <StatusBadge status={device.status} />
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ConnTypeIcon type={device.connectionType} />
              <span className="capitalize">{device.connectionType}</span>
              {device.ip && <span>· {device.ip}</span>}
              {device.shelfLabel && <span>· {device.shelfLabel}</span>}
            </div>
          </div>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400 hover:text-red-300 hover:bg-red-500/10 shrink-0"
            onClick={() => onRemove(device.id)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <BatteryIcon pct={device.batteryPct} />
            <span className={device.batteryPct <= 20 ? "text-red-400 font-medium" : ""}>{device.batteryPct}%</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span>{relTime(device.lastSync)}</span>
          </div>
          {device.linkedProductName && (
            <div className="col-span-2 flex items-center gap-1.5 text-muted-foreground truncate">
              <ShoppingBag className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{device.linkedProductName}</span>
              {device.linkedProductSku && <Badge variant="outline" className="text-[10px] px-1 shrink-0">{device.linkedProductSku}</Badge>}
            </div>
          )}
          {device.firmwareVersion && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Tag className="h-3.5 w-3.5" />
              <span>FW {device.firmwareVersion}</span>
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <PushToEslDialog device={device} />
          <Button size="sm" variant="outline" className="gap-1.5 rounded-xl text-xs h-7"
            disabled={isSyncing} onClick={() => onSync(device.id)}>
            {isSyncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Sync
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
      <div className="rounded-full bg-white/5 p-6">
        <Wifi className="h-12 w-12 text-muted-foreground" />
      </div>
      <div>
        <p className="text-lg font-semibold">No ESL Devices Connected</p>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
          Connect your Electronic Shelf Label devices via USB, Bluetooth, or Network to start managing digital price tags.
        </p>
      </div>
      <ConnectDeviceDialog onSuccess={onConnect} />
    </div>
  );
}

export default function ESLDashboard() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const devicesQ = useQuery<EslDevice[] | { data: EslDevice[] }>({
    queryKey: ["esl-devices"],
    queryFn: () => customFetch("/api/esl/devices"),
    refetchInterval: 10000,
  });

  const historyQ = useQuery<SyncEvent[] | { data: SyncEvent[] }>({
    queryKey: ["esl-history"],
    queryFn: () => customFetch("/api/esl/sync-history?limit=50"),
    refetchInterval: 10000,
  });

  const syncMut = useMutation({
    mutationFn: (id: string) => customFetch(`/api/esl/devices/${id}/sync`, {
      method: "POST", body: JSON.stringify({ action: "full_sync" }), headers: { "Content-Type": "application/json" },
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["esl-devices"] });
      qc.invalidateQueries({ queryKey: ["esl-history"] });
      toast({ title: "Sync triggered" });
    },
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => customFetch(`/api/esl/devices/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["esl-devices"] });
      qc.invalidateQueries({ queryKey: ["esl-history"] });
      toast({ title: "Device removed" });
    },
    onError: () => toast({ title: "Failed to remove device", variant: "destructive" }),
  });

  const devices: EslDevice[] = Array.isArray(devicesQ.data) ? devicesQ.data : (devicesQ.data?.data ?? []);
  const history: SyncEvent[] = Array.isArray(historyQ.data) ? historyQ.data : (historyQ.data?.data ?? []);

  const online = devices.filter(d => d.status === "online" || d.status === "syncing").length;
  const offline = devices.filter(d => d.status === "offline" || d.status === "error").length;
  const lowBat = devices.filter(d => d.batteryPct <= 20).length;

  const kpis = [
    { label: "Total Devices", value: devices.length, icon: <Wifi className="h-4 w-4 text-sky-400" /> },
    { label: "Online", value: online, icon: <CheckCircle className="h-4 w-4 text-emerald-400" /> },
    { label: "Offline", value: offline, icon: <WifiOff className="h-4 w-4 text-zinc-400" /> },
    { label: "Low Battery", value: lowBat, icon: <BatteryLow className="h-4 w-4 text-red-400" /> },
  ];

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wifi className="h-6 w-6 text-sky-400" /> ESL Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage Electronic Shelf Labels — sync prices, stock and promotions wirelessly
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2 rounded-[20px]"
            onClick={() => { qc.invalidateQueries({ queryKey: ["esl-devices"] }); qc.invalidateQueries({ queryKey: ["esl-history"] }); }}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
          <ConnectDeviceDialog onSuccess={() => { qc.invalidateQueries({ queryKey: ["esl-devices"] }); qc.invalidateQueries({ queryKey: ["esl-history"] }); }} />
        </div>
      </div>

      {/* Browser API warnings */}
      <div className="space-y-2">
        <BrowserApiAlert type="usb" />
        <BrowserApiAlert type="bluetooth" />
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {kpis.map(k => (
          <Card key={k.label} className="border border-white/10 bg-white/5 rounded-2xl">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="rounded-xl bg-white/5 p-2">{k.icon}</div>
              <div>
                <p className="text-xl font-bold">{k.value}</p>
                <p className="text-xs text-muted-foreground">{k.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Device grid */}
      {devicesQ.isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : devices.length === 0 ? (
        <EmptyState onConnect={() => qc.invalidateQueries({ queryKey: ["esl-devices"] })} />
      ) : (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
            <Activity className="h-3.5 w-3.5" /> Connected Devices
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {devices.map(d => (
              <DeviceCard key={d.id} device={d}
                onSync={id => syncMut.mutate(id)}
                onRemove={id => removeMut.mutate(id)} />
            ))}
          </div>
        </div>
      )}

      {/* Sync history */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
          <Clock className="h-3.5 w-3.5" /> Sync & Event History
        </h2>
        <Card className="border border-white/10 bg-white/5 rounded-2xl overflow-hidden">
          {historyQ.isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : history.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No sync events yet. Connect a device and push an update to see history here.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/10">
                    <TableHead>Time</TableHead>
                    <TableHead>Device</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>By</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map(evt => (
                    <TableRow key={evt.id} className="border-white/10 text-sm">
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {new Date(evt.timestamp).toLocaleString("en-GH", { dateStyle: "short", timeStyle: "short" })}
                      </TableCell>
                      <TableCell className="font-medium">{evt.deviceName}</TableCell>
                      <TableCell>{evt.productName}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {evt.action.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs font-medium ${evt.status === "success" ? "text-emerald-400" : evt.status === "failed" ? "text-red-400" : "text-amber-400"}`}>
                          {evt.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{evt.initiatedBy}</TableCell>
                      <TableCell className="text-muted-foreground text-xs max-w-[200px] truncate">{evt.details ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
