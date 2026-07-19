import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@/workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  Printer,
  AlertTriangle,
  Loader2,
  Usb,
  Bluetooth,
  Network,
  Plus,
  RefreshCw,
  Eye,
  Tag,
  QrCode,
  Hash,
  Package,
  BarChart,
  Clock,
  CheckCircle,
  FileText,
} from "lucide-react";

interface Printer {
  id: string;
  name: string;
  type: "usb" | "network" | "bluetooth";
  address?: string;
  status: "ready" | "busy" | "offline";
}

interface PrintJob {
  id: string;
  labelType: string;
  printerName: string;
  productName: string;
  sku?: string;
  copies: number;
  status: string;
  initiatedBy: string;
  timestamp: number;
}

type LabelType = "barcode" | "shelf" | "qr" | "sku" | "inventory" | "price_tag";

const LABEL_TYPES: { value: LabelType; label: string; desc: string; icon: React.ReactNode }[] = [
  {
    value: "barcode",
    label: "Barcode Label",
    desc: "Product barcode with name & price",
    icon: <BarChart className="h-4 w-4" />,
  },
  {
    value: "shelf",
    label: "Shelf Label",
    desc: "Retail shelf display tag",
    icon: <Tag className="h-4 w-4" />,
  },
  {
    value: "qr",
    label: "QR Code Label",
    desc: "QR code with product details",
    icon: <QrCode className="h-4 w-4" />,
  },
  {
    value: "sku",
    label: "SKU Label",
    desc: "Internal SKU identifier label",
    icon: <Hash className="h-4 w-4" />,
  },
  {
    value: "inventory",
    label: "Inventory Label",
    desc: "Warehouse bin / stock label",
    icon: <Package className="h-4 w-4" />,
  },
  {
    value: "price_tag",
    label: "Price Tag",
    desc: "Standalone GHS price sticker",
    icon: <FileText className="h-4 w-4" />,
  },
];

function BrowserApiWarning() {
  const usbOk = "usb" in navigator;
  const btOk = "bluetooth" in navigator;
  if (usbOk && btOk) return null;
  return (
    <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
      <div className="space-y-0.5">
        <p className="font-medium">Limited browser support detected</p>
        <p>
          {!usbOk && "Web USB is not available (use Chrome/Edge on desktop). "}
          {!btOk && "Web Bluetooth is not available (use Chrome/Edge on desktop). "}
          Network printers work in all browsers. Manual print via Print Preview is always available.
        </p>
      </div>
    </div>
  );
}

function generateBarcodeSVG(value: string): string {
  const bars = value.split("").map((c, i) => {
    const x = i * 3;
    const h = c.charCodeAt(0) % 3 === 0 ? 40 : 30;
    return `<rect x="${x}" y="0" width="2" height="${h}" fill="black"/>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${value.length * 3 + 20}" height="60">
    <rect width="100%" height="100%" fill="white"/>
    <g transform="translate(10,10)">${bars.join("")}</g>
    <text x="50%" y="58" text-anchor="middle" font-size="8" font-family="monospace">${value}</text>
  </svg>`;
}

function generateQrPlaceholder(value: string): string {
  const seed = value.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const cells: string[] = [];
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 10; c++) {
      if ((seed * (r + 1) * (c + 1)) % 3 !== 0) {
        cells.push(`<rect x="${c * 6}" y="${r * 6}" width="5" height="5" fill="black"/>`);
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80">
    <rect width="100%" height="100%" fill="white"/>
    <g transform="translate(5,5)">${cells.join("")}</g>
  </svg>`;
}

function LabelPreview({ type, form }: { type: LabelType; form: Record<string, string> }) {
  const barSvg = generateBarcodeSVG(form.barcode || form.sku || "000000000");
  const qrSvg = generateQrPlaceholder(`${form.productName}|${form.sku}|${form.price}`);
  const price = form.price ? parseFloat(form.price) : 0;
  const ghsPrice = new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" }).format(
    price,
  );

  const baseClass =
    "border-2 border-dashed border-gray-300 rounded-xl bg-white text-black p-4 max-w-[320px] mx-auto font-sans text-[11px] select-none";

  if (type === "barcode")
    return (
      <div className={baseClass}>
        <p className="font-bold text-sm text-center mb-1 leading-tight">
          {form.productName || "Product Name"}
        </p>
        <p className="text-center text-gray-500 mb-2">
          {form.sku || "SKU-000"} {form.category ? `· ${form.category}` : ""}
        </p>
        <div dangerouslySetInnerHTML={{ __html: barSvg }} className="flex justify-center" />
        <p className="text-center font-bold text-base mt-1">{ghsPrice}</p>
        {form.promoText && (
          <p className="text-center text-red-600 text-[10px] mt-0.5">{form.promoText}</p>
        )}
      </div>
    );

  if (type === "shelf")
    return (
      <div className={`${baseClass} flex gap-3 items-center`}>
        <div className="flex-1">
          <p className="font-bold text-base leading-tight">{form.productName || "Product Name"}</p>
          <p className="text-gray-500">{form.sku || "SKU-000"}</p>
          <p className="text-gray-500">{form.category || "Category"}</p>
          {form.promoText && <p className="text-red-600 font-medium mt-1">{form.promoText}</p>}
          <p className="text-gray-600 mt-1">Stock: {form.stock || "—"} units</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-blue-800">{ghsPrice}</p>
          <p className="text-gray-400 text-[9px]">incl. VAT</p>
        </div>
      </div>
    );

  if (type === "qr")
    return (
      <div className={`${baseClass} flex gap-3 items-center`}>
        <div dangerouslySetInnerHTML={{ __html: qrSvg }} className="shrink-0" />
        <div>
          <p className="font-bold">{form.productName || "Product Name"}</p>
          <p className="text-gray-500">SKU: {form.sku || "—"}</p>
          <p className="font-bold text-lg">{ghsPrice}</p>
          {form.promoText && <p className="text-red-600 text-[10px]">{form.promoText}</p>}
        </div>
      </div>
    );

  if (type === "sku")
    return (
      <div className={baseClass}>
        <p className="text-center text-gray-500 mb-0.5">Internal SKU Label</p>
        <p className="font-bold text-center text-base">{form.sku || "SKU-000000"}</p>
        <div dangerouslySetInnerHTML={{ __html: barSvg }} className="flex justify-center my-1" />
        <p className="text-center">{form.productName || "Product Name"}</p>
        <p className="text-center text-gray-500">{form.category || "Category"}</p>
      </div>
    );

  if (type === "inventory")
    return (
      <div className={baseClass}>
        <div className="flex justify-between items-start">
          <div>
            <p className="font-bold text-sm">{form.productName || "Product Name"}</p>
            <p className="text-gray-500">SKU: {form.sku || "—"}</p>
            <p className="text-gray-500">Cat: {form.category || "—"}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold">{form.stock || "0"}</p>
            <p className="text-gray-500 text-[9px]">units in bin</p>
          </div>
        </div>
        <div dangerouslySetInnerHTML={{ __html: barSvg }} className="flex justify-center mt-2" />
        {form.promoText && (
          <p className="text-center text-gray-600 text-[9px] mt-1">{form.promoText}</p>
        )}
      </div>
    );

  return (
    <div className={baseClass}>
      <p className="text-center text-gray-500 text-[9px] mb-1">PRICE TAG</p>
      <p className="text-center font-bold text-sm">{form.productName || "Product Name"}</p>
      <p className="text-center text-3xl font-bold text-blue-800 my-2">{ghsPrice}</p>
      {form.promoText && <p className="text-center text-red-600 font-semibold">{form.promoText}</p>}
      <p className="text-center text-gray-400 text-[9px] mt-1">{form.sku || ""}</p>
    </div>
  );
}

export default function LabelPrinterPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const printRef = useRef<HTMLDivElement>(null);

  const [printers, setPrinters] = useState<Printer[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<Printer | null>(null);
  const [labelType, setLabelType] = useState<LabelType>("shelf");
  const [copies, setCopies] = useState(1);
  const [detecting, setDetecting] = useState(false);
  const [form, setForm] = useState({
    productName: "",
    sku: "",
    barcode: "",
    price: "",
    stock: "",
    category: "",
    promoText: "",
  });

  const jobsQ = useQuery<PrintJob[]>({
    queryKey: ["label-print-jobs"],
    queryFn: () => customFetch("/api/label-printer/jobs?limit=50"),
    refetchInterval: 15000,
  });

  const logJobMut = useMutation({
    mutationFn: (data: object) =>
      customFetch("/api/label-printer/jobs", {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["label-print-jobs"] }),
  });

  const [networkIpInput, setNetworkIpInput] = useState("");
  const [networkScanSubnet, setNetworkScanSubnet] = useState("192.168.1");
  const [showNetworkDialog, setShowNetworkDialog] = useState(false);
  const [scanning, setScanning] = useState(false);

  async function detectPrinters() {
    setDetecting(true);
    const found: Printer[] = [];

    if ("usb" in navigator) {
      try {
        const devices: any[] = await (navigator as any).usb.getDevices();
        for (const d of devices) {
          if (d.productName) {
            found.push({
              id: d.serialNumber ?? d.productName,
              name: d.productName,
              type: "usb",
              status: "ready",
            });
          }
        }
      } catch {
        /* ignore */
      }
    }

    if ("bluetooth" in navigator) {
      try {
        const devices: any[] = (await (navigator as any).bluetooth.getDevices?.()) ?? [];
        for (const d of devices) {
          found.push({
            id: d.id,
            name: d.name ?? "Bluetooth Printer",
            type: "bluetooth",
            status: "ready",
          });
        }
      } catch {
        /* ignore */
      }
    }

    if (found.length === 0) {
      found.push({
        id: "system-default",
        name: "System Default Printer",
        type: "network",
        status: "ready",
      });
    }

    setPrinters((p) => {
      const existingIds = new Set(p.map((x) => x.id));
      const newOnes = found.filter((f) => !existingIds.has(f.id));
      return [...p, ...newOnes];
    });
    if (!selectedPrinter && found.length > 0) setSelectedPrinter(found[0]);
    setDetecting(false);
    toast({ title: `${found.length} local device(s) found` });
  }

  async function scanNetworkPrinters() {
    setScanning(true);
    try {
      const result: Printer[] = await customFetch(
        `/api/label-printer/network-scan?subnet=${encodeURIComponent(networkScanSubnet)}&port=9100`,
      );
      if (result.length === 0) {
        toast({
          title: "No network printers found",
          description: `No printers responding on ${networkScanSubnet}.0/24 port 9100.`,
        });
      } else {
        setPrinters((p) => {
          const existingIds = new Set(p.map((x) => x.id));
          const newOnes = result.filter((f) => !existingIds.has(f.id));
          return [...p, ...newOnes];
        });
        if (!selectedPrinter) setSelectedPrinter(result[0]);
        toast({ title: `${result.length} network printer(s) found` });
      }
    } catch {
      toast({
        title: "Network scan failed",
        description: "Could not reach the server scanner.",
        variant: "destructive",
      });
    }
    setScanning(false);
  }

  function addNetworkPrinterManual() {
    const ip = networkIpInput.trim();
    if (!ip) return;
    const np: Printer = {
      id: `net-${ip}`,
      name: `Network Printer (${ip})`,
      type: "network",
      address: ip,
      status: "ready",
    };
    setPrinters((p) => [...p, np]);
    setSelectedPrinter(np);
    setNetworkIpInput("");
    setShowNetworkDialog(false);
    toast({ title: "Network printer added" });
  }

  function handlePrint() {
    if (!selectedPrinter) {
      toast({ title: "Select a printer first", variant: "destructive" });
      return;
    }
    if (!form.productName.trim()) {
      toast({ title: "Enter a product name", variant: "destructive" });
      return;
    }

    const style = `
      @media print {
        body > *:not(#label-print-root) { display: none !important; }
        #label-print-root { display: block !important; }
      }
      #label-print-root { display: none; }
    `;
    let styleEl = document.getElementById("__label-print-style") as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = "__label-print-style";
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = style;

    const wrap = document.getElementById("label-print-root");
    if (wrap) wrap.style.display = "block";

    window.print();

    setTimeout(() => {
      if (wrap) wrap.style.display = "none";
    }, 500);

    logJobMut.mutate({
      labelType,
      printerName: selectedPrinter.name,
      printerType: selectedPrinter.type,
      productName: form.productName,
      sku: form.sku || undefined,
      barcode: form.barcode || undefined,
      price: form.price ? Number(form.price) : undefined,
      stock: form.stock ? Number(form.stock) : undefined,
      category: form.category || undefined,
      promoText: form.promoText || undefined,
      copies,
    });

    toast({
      title: "Sent to printer",
      description: `${copies}× ${labelType} label for ${form.productName}`,
    });
  }

  const jobs = jobsQ.data ?? [];

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Printer className="h-6 w-6 text-violet-400" /> Label Printer
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Print barcodes, shelf labels, QR codes, SKU labels and inventory tags
          </p>
        </div>
      </div>

      <BrowserApiWarning />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Printer picker + Label form */}
        <div className="space-y-4">
          {/* Printer detection */}
          <Card className="border border-white/10 bg-white/5 rounded-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Printer className="h-4 w-4 text-violet-400" /> Printer Selection
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2 flex-wrap">
                <Button
                  variant="outline"
                  className="gap-2 rounded-[20px] text-sm"
                  onClick={detectPrinters}
                  disabled={detecting}
                >
                  {detecting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  {detecting ? "Detecting…" : "Detect USB/BT"}
                </Button>
                <Button
                  variant="outline"
                  className="gap-2 rounded-[20px] text-sm"
                  onClick={() => setShowNetworkDialog(true)}
                >
                  <Network className="h-4 w-4 text-emerald-400" /> Network Printer
                </Button>
              </div>

              {/* Network printer dialog */}
              {showNetworkDialog && (
                <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
                  <p className="text-sm font-medium text-muted-foreground">Network Printer</p>
                  <div className="flex gap-2">
                    <div className="flex-1 space-y-1">
                      <label className="text-xs text-muted-foreground">
                        Subnet (first 3 octets)
                      </label>
                      <Input
                        value={networkScanSubnet}
                        onChange={(e) => setNetworkScanSubnet(e.target.value)}
                        placeholder="192.168.1"
                        className="h-8 text-sm font-mono"
                      />
                    </div>
                    <div className="flex items-end">
                      <Button
                        size="sm"
                        className="rounded-[14px] gap-1.5"
                        onClick={scanNetworkPrinters}
                        disabled={scanning}
                      >
                        {scanning ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Network className="h-3.5 w-3.5" />
                        )}
                        {scanning ? "Scanning…" : "Scan /24"}
                      </Button>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={networkIpInput}
                      onChange={(e) => setNetworkIpInput(e.target.value)}
                      placeholder="192.168.1.50 (manual IP)"
                      className="h-8 text-sm font-mono"
                      onKeyDown={(e) => e.key === "Enter" && addNetworkPrinterManual()}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-[14px] shrink-0"
                      onClick={addNetworkPrinterManual}
                      disabled={!networkIpInput.trim()}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add
                    </Button>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full text-xs"
                    onClick={() => setShowNetworkDialog(false)}
                  >
                    Close
                  </Button>
                </div>
              )}

              <div className="flex gap-2 flex-wrap">
                {"usb" in navigator && (
                  <Button
                    variant="outline"
                    className="gap-2 rounded-[20px] text-sm"
                    onClick={async () => {
                      try {
                        const d = await (navigator as any).usb.requestDevice({ filters: [] });
                        const p: Printer = {
                          id: d.serialNumber ?? d.productName,
                          name: d.productName ?? "USB Printer",
                          type: "usb",
                          status: "ready",
                        };
                        setPrinters((prev) => [...prev.filter((x) => x.id !== p.id), p]);
                        setSelectedPrinter(p);
                      } catch {
                        toast({ title: "No USB printer selected", variant: "destructive" });
                      }
                    }}
                  >
                    <Usb className="h-4 w-4 text-sky-400" /> Connect USB
                  </Button>
                )}
              </div>

              {printers.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  No printers found. Click "Detect Printers" or add a network printer by IP address.
                  Your OS printer drivers must be installed.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {printers.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={`w-full text-left rounded-xl border px-3 py-2.5 flex items-center gap-3 text-sm transition-colors ${selectedPrinter?.id === p.id ? "border-violet-500/60 bg-violet-500/10" : "border-white/10 hover:bg-white/5"}`}
                      onClick={() => setSelectedPrinter(p)}
                    >
                      {p.type === "usb" ? (
                        <Usb className="h-4 w-4 text-sky-400 shrink-0" />
                      ) : p.type === "bluetooth" ? (
                        <Bluetooth className="h-4 w-4 text-violet-400 shrink-0" />
                      ) : (
                        <Network className="h-4 w-4 text-emerald-400 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{p.name}</p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {p.type}
                          {p.address ? ` · ${p.address}` : ""}
                        </p>
                      </div>
                      <span
                        className={`h-2 w-2 rounded-full shrink-0 ${p.status === "ready" ? "bg-emerald-400" : "bg-zinc-500"}`}
                      />
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Label type */}
          <Card className="border border-white/10 bg-white/5 rounded-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Tag className="h-4 w-4 text-amber-400" /> Label Type
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {LABEL_TYPES.map((lt) => (
                  <button
                    key={lt.value}
                    type="button"
                    onClick={() => setLabelType(lt.value)}
                    className={`rounded-xl border px-3 py-2.5 text-left text-xs transition-colors ${labelType === lt.value ? "border-amber-500/60 bg-amber-500/10 text-amber-300" : "border-white/10 hover:bg-white/5"}`}
                  >
                    <div className="flex items-center gap-1.5 mb-0.5 font-medium">
                      {lt.icon}
                      {lt.label}
                    </div>
                    <div className="text-muted-foreground">{lt.desc}</div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Product details form */}
          <Card className="border border-white/10 bg-white/5 rounded-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Package className="h-4 w-4 text-sky-400" /> Product Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label>Product Name *</Label>
                <Input
                  className="rounded-[20px]"
                  placeholder="Milo 400g"
                  value={form.productName}
                  onChange={(e) => setForm((f) => ({ ...f, productName: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>SKU</Label>
                  <Input
                    className="rounded-[20px]"
                    placeholder="MILO-400G"
                    value={form.sku}
                    onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Barcode</Label>
                  <Input
                    className="rounded-[20px]"
                    placeholder="6001068012345"
                    value={form.barcode}
                    onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Price (GHS)</Label>
                  <Input
                    type="number"
                    className="rounded-[20px]"
                    placeholder="0.00"
                    value={form.price}
                    onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Stock Qty</Label>
                  <Input
                    type="number"
                    className="rounded-[20px]"
                    placeholder="0"
                    value={form.stock}
                    onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Category</Label>
                <Input
                  className="rounded-[20px]"
                  placeholder="Beverages"
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Promo / Note</Label>
                <Input
                  className="rounded-[20px]"
                  placeholder="e.g. 10% OFF – Ends Friday"
                  value={form.promoText}
                  onChange={(e) => setForm((f) => ({ ...f, promoText: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Copies</Label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  className="rounded-[20px] w-24"
                  value={copies}
                  onChange={(e) => setCopies(Math.max(1, Math.min(100, Number(e.target.value))))}
                />
              </div>
            </CardContent>
          </Card>

          <Button
            onClick={handlePrint}
            className="w-full gap-2 rounded-[20px] bg-violet-600 hover:bg-violet-700 text-white h-11"
            disabled={!form.productName.trim()}
          >
            <Printer className="h-5 w-5" /> Print {copies > 1 ? `${copies}×` : ""}{" "}
            {LABEL_TYPES.find((l) => l.value === labelType)?.label}
          </Button>
        </div>

        {/* Right: Live preview + print history */}
        <div className="space-y-4">
          <Card className="border border-white/10 bg-white/5 rounded-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Eye className="h-4 w-4 text-emerald-400" /> Print Preview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className="bg-gray-100 rounded-xl p-6 min-h-[200px] flex items-center justify-center"
                ref={printRef}
              >
                <LabelPreview type={labelType} form={form} />
              </div>
              <p className="text-xs text-muted-foreground text-center mt-3">
                Live preview — updates as you type. Actual print may vary by label stock size.
              </p>
            </CardContent>
          </Card>

          {/* Print history */}
          <Card className="border border-white/10 bg-white/5 rounded-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" /> Print History
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {jobsQ.isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : jobs.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No print jobs yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-white/10">
                        <TableHead>Product</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Printer</TableHead>
                        <TableHead>Copies</TableHead>
                        <TableHead>Time</TableHead>
                        <TableHead>By</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {jobs.map((j) => (
                        <TableRow key={j.id} className="border-white/10 text-sm">
                          <TableCell className="font-medium max-w-[100px] truncate">
                            {j.productName}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px] capitalize">
                              {j.labelType.replace(/_/g, " ")}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs truncate max-w-[80px]">
                            {j.printerName}
                          </TableCell>
                          <TableCell>{j.copies}</TableCell>
                          <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                            {new Date(j.timestamp).toLocaleString("en-GH", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs">
                            {j.initiatedBy}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Hidden print target rendered once for all label types */}
      <div id="label-print-root" style={{ display: "none" }}>
        {Array.from({ length: copies }).map((_, i) => (
          <div key={i} style={{ pageBreakAfter: i < copies - 1 ? "always" : "auto" }}>
            <LabelPreview type={labelType} form={form} />
          </div>
        ))}
      </div>
    </div>
  );
}
