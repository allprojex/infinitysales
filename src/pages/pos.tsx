import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useListProducts, useListCustomers, useCreateSale, getListProductsQueryKey, customFetch } from "@/workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  Search, Plus, Minus, Trash2, ShoppingCart, CreditCard, Barcode, Package,
  CheckCircle, X, Percent, Banknote, Smartphone, Building2, Tag, User, Printer,
  ChevronRight, ReceiptText, Pause, Gift, Star, SplitSquareHorizontal, Clock,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

function playAddToCartSound() {
  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = "sine";
    osc.frequency.setValueAtTime(1047, now);
    osc.frequency.setValueAtTime(1319, now + 0.07);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.28, now + 0.01);
    gain.gain.setValueAtTime(0.28, now + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    osc.start(now);
    osc.stop(now + 0.22);

    setTimeout(() => ctx.close(), 400);
  } catch {
  }
}

type CartItem = {
  id: number;
  name: string;
  price: number;
  quantity: number;
  stock: number;
  sku: string | null;
  category: string | null;
};

type PaymentMethod = "cash" | "card" | "mobile_money" | "bank_transfer";

type HeldSale = {
  id: string;
  label: string;
  cart: CartItem[];
  customerId: string;
  timestamp: number;
};

const GHS = (v: number) =>
  new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" }).format(v);

const CATEGORY_COLORS: Record<string, string> = {
  Electronics: "bg-sky-500/10 text-sky-600 border-sky-500/20",
  Furniture: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  Food: "bg-green-500/10 text-green-700 border-green-500/20",
  Clothing: "bg-violet-500/10 text-violet-600 border-violet-500/20",
  Health: "bg-rose-500/10 text-rose-600 border-rose-500/20",
  Default: "bg-primary/10 text-primary border-primary/20",
};

const CATEGORY_ICONS: Record<string, string> = {
  Electronics: "⚡",
  Furniture: "🪑",
  Food: "🥗",
  Clothing: "👕",
  Health: "💊",
  Default: "📦",
};

const PAYMENT_METHODS: { id: PaymentMethod; label: string; icon: React.ReactNode }[] = [
  { id: "cash", label: "Cash", icon: <Banknote className="h-4 w-4" /> },
  { id: "card", label: "Card", icon: <CreditCard className="h-4 w-4" /> },
  { id: "mobile_money", label: "MoMo", icon: <Smartphone className="h-4 w-4" /> },
  { id: "bank_transfer", label: "Bank", icon: <Building2 className="h-4 w-4" /> },
];

function ProductCard({ product, inCart, onClick }: {
  product: { id: number; name: string; price: number; stock: number; sku: string | null; category: string | null; thumbnailUrl?: string | null };
  inCart: number;
  onClick: () => void;
}) {
  const isOut = product.stock === 0;
  const cat = product.category ?? "Default";
  const colorClass = CATEGORY_COLORS[cat] ?? CATEGORY_COLORS.Default;
  const emoji = CATEGORY_ICONS[cat] ?? CATEGORY_ICONS.Default;

  return (
    <button
      onClick={onClick}
      disabled={isOut}
      className={cn(
        "relative flex flex-col p-3 rounded-2xl border text-left transition-all select-none",
        "hover:shadow-md active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        isOut
          ? "opacity-40 cursor-not-allowed bg-muted border-border"
          : inCart > 0
          ? "bg-primary/5 border-primary/50 ring-1 ring-primary/20 cursor-pointer"
          : "bg-card hover:border-primary/40 cursor-pointer border-border"
      )}
    >
      {inCart > 0 && (
        <span className="absolute top-2 right-2 h-5 w-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center z-10">
          {inCart}
        </span>
      )}

      <div className={cn("h-14 w-full rounded-xl flex items-center justify-center mb-2.5 border overflow-hidden", colorClass)}>
        {product.thumbnailUrl ? (
          <img
            src={product.thumbnailUrl}
            alt={product.name}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <span className="text-2xl">{emoji}</span>
        )}
      </div>

      <p className="text-xs font-semibold line-clamp-2 leading-snug mb-1.5 flex-1">{product.name}</p>

      <div className="mt-auto">
        <p className="text-base font-bold text-primary leading-none">{GHS(product.price)}</p>
        <div className="flex items-center justify-between mt-1">
          {product.category && (
            <span className={cn("text-[9px] font-medium px-1.5 py-0.5 rounded-full border", colorClass)}>
              {product.category}
            </span>
          )}
          <span className={cn("text-[10px] ml-auto", product.stock <= 5 ? "text-amber-500 font-medium" : "text-muted-foreground")}>
            {isOut ? "Out of stock" : `${product.stock} left`}
          </span>
        </div>
      </div>
    </button>
  );
}

type ReceiptData = {
  invoiceNumber: string;
  items: CartItem[];
  subtotal: number;
  discount: number;
  discountType: "percent" | "fixed";
  discountAmount: number;
  taxEnabled: boolean;
  vatAmount: number;
  nhilAmount: number;
  getfundAmount: number;
  loyaltyDiscount: number;
  loyaltyPointsEarned: number;
  total: number;
  paymentMethod: PaymentMethod;
  splitPayment: boolean;
  secondPaymentMethod?: PaymentMethod;
  splitAmount1: number;
  splitAmount2: number;
  amountTendered: number;
  change: number;
  customerName: string;
  date: Date;
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildReceiptHtml(receipt: ReceiptData): string {
  const pmLabel = PAYMENT_METHODS.find(p => p.id === receipt.paymentMethod)?.label ?? receipt.paymentMethod;
  const pm2Label = receipt.secondPaymentMethod ? (PAYMENT_METHODS.find(p => p.id === receipt.secondPaymentMethod)?.label ?? receipt.secondPaymentMethod) : "";
  const dateStr = format(receipt.date, "dd MMM yyyy, h:mm a");

  const safeInvoiceNumber = escapeHtml(receipt.invoiceNumber);
  const safeCustomerName = escapeHtml(receipt.customerName);
  const safePmLabel = escapeHtml(pmLabel);

  const itemRows = receipt.items.map(item => `
    <tr>
      <td style="padding:2px 0;vertical-align:top">${escapeHtml(item.name)}</td>
      <td style="padding:2px 0;text-align:center;white-space:nowrap;vertical-align:top">${item.quantity}&times;${GHS(item.price)}</td>
      <td style="padding:2px 0;text-align:right;white-space:nowrap;vertical-align:top;font-weight:600">${GHS(item.price * item.quantity)}</td>
    </tr>`).join("");

  const discountRow = receipt.discountAmount > 0 ? `
    <tr>
      <td colspan="2" style="padding:1px 0;color:#16a34a">Discount${receipt.discountType === "percent" ? ` (${receipt.discount}%)` : ""}</td>
      <td style="text-align:right;color:#16a34a">-${GHS(receipt.discountAmount)}</td>
    </tr>` : "";

  const loyaltyRow = receipt.loyaltyDiscount > 0 ? `
    <tr>
      <td colspan="2" style="padding:1px 0;color:#7c3aed">Loyalty Redeemed</td>
      <td style="text-align:right;color:#7c3aed">-${GHS(receipt.loyaltyDiscount)}</td>
    </tr>` : "";

  const taxRows = receipt.taxEnabled ? `
    <tr><td colspan="2" style="padding:1px 0;color:#6b7280">VAT (15%)</td><td style="text-align:right;color:#6b7280">${GHS(receipt.vatAmount)}</td></tr>
    <tr><td colspan="2" style="padding:1px 0;color:#6b7280">NHIL (2.5%)</td><td style="text-align:right;color:#6b7280">${GHS(receipt.nhilAmount)}</td></tr>
    <tr><td colspan="2" style="padding:1px 0;color:#6b7280">GETFund (2.5%)</td><td style="text-align:right;color:#6b7280">${GHS(receipt.getfundAmount)}</td></tr>` : "";

  const paymentRows = receipt.splitPayment ? `
    <tr><td>${safePmLabel}</td><td></td><td style="text-align:right">${GHS(receipt.splitAmount1)}</td></tr>
    <tr><td>${escapeHtml(pm2Label)}</td><td></td><td style="text-align:right">${GHS(receipt.splitAmount2)}</td></tr>` : `
    <tr><td>${safePmLabel}</td><td></td><td style="text-align:right">${GHS(receipt.total)}</td></tr>`;

  const cashRows = receipt.paymentMethod === "cash" && !receipt.splitPayment && receipt.amountTendered >= receipt.total ? `
    <tr><td>Tendered</td><td></td><td style="text-align:right">${GHS(receipt.amountTendered)}</td></tr>
    <tr><td style="font-weight:600">Change</td><td></td><td style="text-align:right;font-weight:600">${GHS(receipt.change)}</td></tr>` : "";

  const loyaltyEarnedRow = receipt.loyaltyPointsEarned > 0 ? `<div style="text-align:center;font-size:9pt;color:#7c3aed;margin-top:4px">+${receipt.loyaltyPointsEarned} loyalty points earned!</div>` : "";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Receipt ${safeInvoiceNumber}</title>
  <style>
    @page { size: 80mm auto; margin: 6mm; }
    * { box-sizing: border-box; }
    body { font-family: 'Courier New', Courier, monospace; font-size: 11pt; color: #111; margin: 0; padding: 0; width: 100%; }
    .center { text-align: center; }
    .bold { font-weight: 700; }
    .divider { border: none; border-top: 1px dashed #888; margin: 6px 0; }
    table { width: 100%; border-collapse: collapse; font-size: 10pt; }
    .total-row td { font-size: 13pt; font-weight: 700; padding-top: 4px; border-top: 1px solid #333; }
    .footer { font-size: 9pt; color: #555; text-align: center; margin-top: 10px; }
    @media print { body { -webkit-print-color-adjust: exact; } }
  </style>
</head>
<body>
  <div class="center">
    <div class="bold" style="font-size:13pt">Infinity Sales &amp; Inventory</div>
    <div style="font-size:9pt;color:#555">POS Receipt</div>
    <div style="font-size:9pt">${dateStr}</div>
  </div>
  <hr class="divider"/>
  <div style="font-size:9pt"><strong>Invoice:</strong> ${safeInvoiceNumber}</div>
  <div style="font-size:9pt"><strong>Customer:</strong> ${safeCustomerName}</div>
  <hr class="divider"/>
  <table>
    <thead>
      <tr style="font-size:9pt;color:#555">
        <th style="text-align:left">Item</th>
        <th style="text-align:center">Qty×Price</th>
        <th style="text-align:right">Total</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>
  <hr class="divider"/>
  <table>
    <tr><td>Subtotal</td><td></td><td style="text-align:right">${GHS(receipt.subtotal)}</td></tr>
    ${discountRow}
    ${loyaltyRow}
    ${taxRows}
    <tr class="total-row"><td>TOTAL</td><td></td><td style="text-align:right">${GHS(receipt.total)}</td></tr>
  </table>
  <hr class="divider"/>
  <table style="font-size:10pt">
    ${paymentRows}
    ${cashRows}
  </table>
  ${loyaltyEarnedRow}
  <div class="footer">
    <hr class="divider"/>
    Thank you for your purchase!<br/>
    Powered by Infinity Techub Intelligence
  </div>
</body>
</html>`;
}

function printReceipt(receipt: ReceiptData) {
  const html = buildReceiptHtml(receipt);
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:0;height:0;border:none;";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
  if (!doc) { document.body.removeChild(iframe); return; }
  doc.open();
  doc.write(html);
  doc.close();
  setTimeout(() => {
    try { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); } catch {}
    setTimeout(() => { document.body.removeChild(iframe); }, 2000);
  }, 400);
}

function ReceiptDialog({ open, onClose, onNewSale, receipt }: {
  open: boolean;
  onClose: () => void;
  onNewSale: () => void;
  receipt: ReceiptData | null;
}) {
  if (!receipt) return null;
  const pmLabel = PAYMENT_METHODS.find(p => p.id === receipt.paymentMethod)?.label ?? receipt.paymentMethod;
  const pm2Label = receipt.secondPaymentMethod ? (PAYMENT_METHODS.find(p => p.id === receipt.secondPaymentMethod)?.label ?? receipt.secondPaymentMethod) : "";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-emerald-500" /> Sale Complete
          </DialogTitle>
        </DialogHeader>

        <div className="bg-muted/40 rounded-2xl p-4 font-mono text-xs space-y-0.5 max-h-[60vh] overflow-y-auto">
          <div className="text-center mb-3">
            <p className="font-bold text-base font-sans">Infinity Sales &amp; Inventory</p>
            <p className="text-muted-foreground">POS Receipt</p>
            <p className="text-muted-foreground">{format(receipt.date, "dd MMM yyyy, h:mm a")}</p>
          </div>

          <div className="text-[10px] text-muted-foreground border-b pb-1 mb-1 space-y-0.5">
            <div>Invoice: <strong className="text-foreground">{receipt.invoiceNumber}</strong></div>
            <div>Customer: <strong className="text-foreground">{receipt.customerName}</strong></div>
          </div>

          <div className="border-b pb-2 mb-2 space-y-1">
            {receipt.items.map((item) => (
              <div key={item.id} className="flex justify-between gap-2">
                <span className="truncate max-w-[130px]">{item.name}</span>
                <div className="flex gap-3 shrink-0">
                  <span className="text-muted-foreground">{item.quantity}×{GHS(item.price)}</span>
                  <span className="font-semibold">{GHS(item.price * item.quantity)}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-0.5 border-b pb-2 mb-2">
            <div className="flex justify-between"><span>Subtotal</span><span>{GHS(receipt.subtotal)}</span></div>
            {receipt.discountAmount > 0 && (
              <div className="flex justify-between text-emerald-600">
                <span>Discount {receipt.discountType === "percent" ? `(${receipt.discount}%)` : ""}</span>
                <span>-{GHS(receipt.discountAmount)}</span>
              </div>
            )}
            {receipt.loyaltyDiscount > 0 && (
              <div className="flex justify-between text-violet-600">
                <span>Loyalty Redeemed</span>
                <span>-{GHS(receipt.loyaltyDiscount)}</span>
              </div>
            )}
            {receipt.taxEnabled && (
              <>
                <div className="flex justify-between text-muted-foreground"><span>VAT (15%)</span><span>{GHS(receipt.vatAmount)}</span></div>
                <div className="flex justify-between text-muted-foreground"><span>NHIL (2.5%)</span><span>{GHS(receipt.nhilAmount)}</span></div>
                <div className="flex justify-between text-muted-foreground"><span>GETFund (2.5%)</span><span>{GHS(receipt.getfundAmount)}</span></div>
              </>
            )}
          </div>

          <div className="flex justify-between font-bold text-sm">
            <span>TOTAL</span><span>{GHS(receipt.total)}</span>
          </div>

          <div className="text-muted-foreground mt-1 space-y-0.5">
            {receipt.splitPayment ? (
              <>
                <div className="flex justify-between"><span>{pmLabel}</span><span>{GHS(receipt.splitAmount1)}</span></div>
                <div className="flex justify-between"><span>{pm2Label}</span><span>{GHS(receipt.splitAmount2)}</span></div>
              </>
            ) : (
              <>
                <div className="flex justify-between"><span>Payment</span><span>{pmLabel}</span></div>
                {receipt.paymentMethod === "cash" && receipt.amountTendered >= receipt.total && (
                  <>
                    <div className="flex justify-between"><span>Tendered</span><span>{GHS(receipt.amountTendered)}</span></div>
                    <div className="flex justify-between font-semibold text-foreground"><span>Change</span><span>{GHS(receipt.change)}</span></div>
                  </>
                )}
              </>
            )}
          </div>

          {receipt.loyaltyPointsEarned > 0 && (
            <div className="text-center text-violet-600 mt-2 font-sans text-[11px] font-medium">
              <Star className="h-3 w-3 inline mr-1" />+{receipt.loyaltyPointsEarned} loyalty points earned!
            </div>
          )}

          <p className="text-center text-muted-foreground mt-3 text-[10px]">
            Thank you for your purchase!<br />Powered by Infinity Techub Intelligence
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1 rounded-full gap-2 text-sm" onClick={() => printReceipt(receipt)}>
            <Printer className="h-4 w-4" /> Print Receipt
          </Button>
          <Button className="flex-1 rounded-full gap-2 text-sm" onClick={onNewSale}>
            <ReceiptText className="h-4 w-4" /> New Sale
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function HeldSalesDialog({ open, onClose, heldSales, onResume, onDelete }: {
  open: boolean;
  onClose: () => void;
  heldSales: HeldSale[];
  onResume: (sale: HeldSale) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pause className="h-5 w-5 text-amber-500" /> Held Sales ({heldSales.length})
          </DialogTitle>
        </DialogHeader>
        {heldSales.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground text-sm">No sales on hold</div>
        ) : (
          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {heldSales.map((s) => (
              <div key={s.id} className="flex items-center gap-3 p-3 rounded-xl border bg-amber-50 dark:bg-amber-950/20 border-amber-100 dark:border-amber-900/40">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{s.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.cart.length} item{s.cart.length !== 1 ? "s" : ""} · {new Date(s.timestamp).toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <Button size="sm" className="rounded-full h-7 text-xs gap-1" onClick={() => { onResume(s); onClose(); }}>
                    Resume
                  </Button>
                  <button onClick={() => onDelete(s.id)} className="h-7 w-7 rounded-full flex items-center justify-center text-destructive hover:bg-destructive/10 transition-colors">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

const HELD_SALES_KEY = "pos_held_sales";

export default function POS() {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [barcodeInput, setBarcodeInput] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("walkin");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [discountType, setDiscountType] = useState<"percent" | "fixed">("percent");
  const [discountValue, setDiscountValue] = useState<string>("");
  const [amountTendered, setAmountTendered] = useState<string>("");
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<ReceiptData | null>(null);
  const [mobileView, setMobileView] = useState<"products" | "cart">("products");

  const [taxEnabled, setTaxEnabled] = useState(false);
  const [splitPayment, setSplitPayment] = useState(false);
  const [secondPaymentMethod, setSecondPaymentMethod] = useState<PaymentMethod>("mobile_money");
  const [splitAmount1, setSplitAmount1] = useState<string>("");
  const [loyaltyRedeem, setLoyaltyRedeem] = useState(false);
  const [heldSales, setHeldSales] = useState<HeldSale[]>(() => {
    try { return JSON.parse(localStorage.getItem(HELD_SALES_KEY) || "[]"); } catch { return []; }
  });
  const [heldSalesOpen, setHeldSalesOpen] = useState(false);

  const barcodeRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Today's cash sales total. Role-scoped server-side: admins/managers see
  // system-wide; everyone else sees only their own sales.
  const { data: todayCash } = useQuery({
    queryKey: ["/api/reports/pos-today-cash"],
    queryFn: () => customFetch<{ total: number; count: number; scope: "all" | "own"; currency: string }>("/api/reports/pos-today-cash"),
    refetchInterval: 30_000,
  });

  const { data: productsData, isLoading: productsLoading } = useListProducts(
    { limit: 500 },
    { query: { queryKey: getListProductsQueryKey({ limit: 500 }) } }
  );
  const { data: customersData } = useListCustomers({ limit: 200 });
  const createSale = useCreateSale();

  const allProducts = productsData?.data ?? [];

  const categories = useMemo(() => {
    const cats = Array.from(new Set(allProducts.map(p => p.category).filter(Boolean))) as string[];
    return ["All", ...cats.sort()];
  }, [allProducts]);

  const filteredProducts = useMemo(() => {
    let list = allProducts;
    if (activeCategory !== "All") list = list.filter(p => p.category === activeCategory);
    if (search.trim()) list = list.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || (p.sku ?? "").toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [allProducts, activeCategory, search]);

  const addToCart = (p: typeof allProducts[0]) => {
    const item = { id: p.id, name: p.name, price: Number(p.price), stock: p.stock, sku: p.sku ?? null, category: p.category ?? null };
    const existing = cart.find(c => c.id === item.id);
    if (existing) {
      if (existing.quantity >= item.stock) {
        toast({ variant: "destructive", title: "Stock limit reached", description: `Only ${item.stock} available.` });
        return;
      }
      playAddToCartSound();
      setCart(c => c.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i));
    } else {
      if (item.stock === 0) { toast({ variant: "destructive", title: "Out of stock" }); return; }
      playAddToCartSound();
      setCart(c => [...c, { ...item, quantity: 1 }]);
    }
  };

  const updateQty = (id: number, delta: number) => {
    setCart(c => c.map(i => {
      if (i.id !== id) return i;
      const nq = i.quantity + delta;
      if (nq <= 0) return null as unknown as CartItem;
      if (nq > i.stock) return i;
      return { ...i, quantity: nq };
    }).filter(Boolean));
  };

  const setQty = (id: number, qty: number) => {
    const item = cart.find(i => i.id === id);
    if (!item) return;
    if (qty <= 0) { setCart(c => c.filter(i => i.id !== id)); return; }
    if (qty > item.stock) { toast({ variant: "destructive", title: `Max stock: ${item.stock}` }); return; }
    setCart(c => c.map(i => i.id === id ? { ...i, quantity: qty } : i));
  };

  const subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);

  const discountAmount = useMemo(() => {
    const val = parseFloat(discountValue) || 0;
    if (discountType === "percent") return Math.min(subtotal * (val / 100), subtotal);
    return Math.min(val, subtotal);
  }, [discountValue, discountType, subtotal]);

  const afterDiscount = Math.max(subtotal - discountAmount, 0);

  const selectedCustomer = selectedCustomerId !== "walkin"
    ? customersData?.data.find(c => String(c.id) === selectedCustomerId)
    : null;
  const pointsBalance = (selectedCustomer as unknown as { loyaltyPoints?: number })?.loyaltyPoints ?? 0;
  const maxLoyaltyRedeemGHS = Math.min(pointsBalance * 0.01, afterDiscount);
  const loyaltyDiscount = loyaltyRedeem && selectedCustomer ? +maxLoyaltyRedeemGHS.toFixed(2) : 0;
  const loyaltyPointsRedeemed = loyaltyRedeem ? Math.floor(loyaltyDiscount / 0.01) : 0;

  const vatAmount = taxEnabled ? +(afterDiscount * 0.15).toFixed(2) : 0;
  const nhilAmount = taxEnabled ? +(afterDiscount * 0.025).toFixed(2) : 0;
  const getfundAmount = taxEnabled ? +(afterDiscount * 0.025).toFixed(2) : 0;
  const totalTax = vatAmount + nhilAmount + getfundAmount;

  const total = Math.max(afterDiscount + totalTax - loyaltyDiscount, 0);

  const split1Num = parseFloat(splitAmount1) || 0;
  const split2Num = splitPayment ? Math.max(total - split1Num, 0) : 0;

  const tenderedNum = parseFloat(amountTendered) || 0;
  const change = paymentMethod === "cash" && !splitPayment ? Math.max(tenderedNum - total, 0) : 0;
  const canCharge = splitPayment
    ? split1Num > 0 && split1Num <= total
    : paymentMethod === "cash" ? tenderedNum >= total : true;

  const loyaltyPointsEarned = selectedCustomer ? Math.floor(total) : 0;

  const handleBarcodeSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    const val = barcodeInput.trim();
    if (!val) return;
    const match = allProducts.find(p => p.barcode === val || p.sku === val);
    if (match) {
      addToCart(match);
      setBarcodeInput("");
    } else {
      toast({ variant: "destructive", title: "Product not found", description: `No match for: ${val}` });
    }
  };

  const handleCheckout = () => {
    if (cart.length === 0) { toast({ variant: "destructive", title: "Cart is empty" }); return; }
    if (!splitPayment && paymentMethod === "cash" && tenderedNum < total) {
      toast({ variant: "destructive", title: "Insufficient cash", description: `Need at least ${GHS(total)}` });
      return;
    }
    if (splitPayment && (split1Num <= 0 || split1Num > total)) {
      toast({ variant: "destructive", title: "Invalid split amount", description: "First payment must be between 0 and total" });
      return;
    }

    const customerId = selectedCustomerId === "walkin" ? undefined : Number(selectedCustomerId);
    const customerName = selectedCustomerId === "walkin"
      ? "Walk-in Customer"
      : (customersData?.data.find(c => String(c.id) === selectedCustomerId)?.name ?? "Walk-in Customer");

    const taxAmount = +(totalTax).toFixed(2);

    const paymentMethodLabel = splitPayment
      ? `${paymentMethod}+${secondPaymentMethod}`
      : paymentMethod;

    createSale.mutate({
      data: {
        ...(customerId !== undefined ? { customerId } : {}),
        items: cart.map(i => ({ productId: i.id, quantity: i.quantity })),
        tax: taxAmount,
        status: "completed",
        channel: "pos",
        payment_method: paymentMethodLabel,
      } as any,
    }, {
      onSuccess: (res: any) => {
        const receipt: ReceiptData = {
          invoiceNumber: res.invoiceNumber ?? `INV-${Date.now()}`,
          items: [...cart],
          subtotal,
          discount: parseFloat(discountValue) || 0,
          discountType,
          discountAmount,
          taxEnabled,
          vatAmount,
          nhilAmount,
          getfundAmount,
          loyaltyDiscount,
          loyaltyPointsEarned,
          total,
          paymentMethod,
          splitPayment,
          secondPaymentMethod: splitPayment ? secondPaymentMethod : undefined,
          splitAmount1: split1Num,
          splitAmount2: split2Num,
          amountTendered: tenderedNum,
          change,
          customerName,
          date: new Date(),
        };
        setLastReceipt(receipt);
        setReceiptOpen(true);
        setCart([]);
        setDiscountValue("");
        setAmountTendered("");
        setSplitAmount1("");
        setSplitPayment(false);
        setLoyaltyRedeem(false);
        queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
        printReceipt(receipt);
      },
      onError: (err) => toast({ variant: "destructive", title: "Checkout failed", description: err.message }),
    });
  };

  const clearCart = () => {
    setCart([]);
    setDiscountValue("");
    setAmountTendered("");
    setSplitAmount1("");
    setSplitPayment(false);
    setLoyaltyRedeem(false);
  };

  const saveHeldSale = useCallback(() => {
    if (cart.length === 0) { toast({ variant: "destructive", title: "Cart is empty" }); return; }
    const label = `${cart.length} item${cart.length !== 1 ? "s" : ""} · ${new Date().toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" })}`;
    const newHeld: HeldSale = { id: crypto.randomUUID(), label, cart: [...cart], customerId: selectedCustomerId, timestamp: Date.now() };
    const updated = [...heldSales, newHeld];
    setHeldSales(updated);
    localStorage.setItem(HELD_SALES_KEY, JSON.stringify(updated));
    clearCart();
    setSelectedCustomerId("walkin");
    toast({ title: "Sale held", description: `"${label}" saved — resume any time.` });
  }, [cart, heldSales, selectedCustomerId]);

  const resumeHeldSale = useCallback((sale: HeldSale) => {
    setCart(sale.cart);
    setSelectedCustomerId(sale.customerId);
    const updated = heldSales.filter(s => s.id !== sale.id);
    setHeldSales(updated);
    localStorage.setItem(HELD_SALES_KEY, JSON.stringify(updated));
  }, [heldSales]);

  const deleteHeldSale = useCallback((id: string) => {
    const updated = heldSales.filter(s => s.id !== id);
    setHeldSales(updated);
    localStorage.setItem(HELD_SALES_KEY, JSON.stringify(updated));
  }, [heldSales]);

  useEffect(() => { barcodeRef.current?.focus(); }, []);

  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);

  return (
    <div className="flex flex-col h-[calc(100dvh-84px)] -mx-4 md:-mx-6 lg:-mx-8 -mt-4 md:-mt-6 lg:-mt-8 -mb-4 md:-mb-6 lg:-mb-8 px-0 overflow-hidden">
      {/* Top bar */}
      <div className="shrink-0">
        <div className="flex items-center gap-3 px-4 py-3 border-b bg-card">
          <div>
            <h2 className="text-lg font-bold leading-tight">POS Terminal</h2>
            <p className="text-xs text-muted-foreground hidden sm:block">Infinity Sales & Inventory</p>
          </div>
          <div
            data-testid="pos-today-cash"
            data-scope={todayCash?.scope ?? "loading"}
            className="ml-auto flex items-center gap-2 rounded-full border bg-muted/40 px-3 py-1.5"
            aria-label="Today's cash sales total"
          >
            <Banknote className="h-4 w-4 text-emerald-600" />
            <div className="flex flex-col leading-tight">
              <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                Today's cash
                {todayCash?.scope === "all" && (
                  <Badge variant="secondary" className="text-[8px] h-3.5 px-1 leading-none">All users</Badge>
                )}
              </span>
              <span className="text-sm font-bold tabular-nums" data-testid="pos-today-cash-value">
                {GHS(todayCash?.total ?? 0)}
              </span>
            </div>
          </div>
          <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 border-0">
            OPEN
          </Badge>
          <button
            className="relative p-1.5 rounded-full hover:bg-muted transition-colors"
            onClick={() => setMobileView(v => v === "cart" ? "products" : "cart")}
            aria-label="Toggle cart"
          >
            <ShoppingCart className="h-5 w-5 text-muted-foreground" />
            {cartCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
                {cartCount > 99 ? "99+" : cartCount}
              </span>
            )}
          </button>
        </div>
        {/* Mobile tab strip */}
        <div className="md:hidden flex border-b bg-card">
          <button
            onClick={() => setMobileView("products")}
            className={cn(
              "flex-1 py-2.5 text-sm font-medium text-center transition-colors border-b-2",
              mobileView === "products"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            Products
          </button>
          <button
            onClick={() => setMobileView("cart")}
            className={cn(
              "flex-1 py-2.5 text-sm font-medium transition-colors border-b-2 flex items-center justify-center gap-1.5",
              mobileView === "cart"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            Cart
            {cartCount > 0 && (
              <span className="h-4 min-w-[1rem] px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* LEFT — Product Browser */}
        <div className={cn("flex-col flex-1 min-w-0 overflow-hidden border-r", mobileView === "products" ? "flex" : "hidden md:flex")}>
          {/* Search + Barcode */}
          <div className="flex gap-2 px-4 pt-3 pb-2 shrink-0">
            <div className="relative flex-1">
              <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                ref={barcodeRef}
                id="pos-barcode"
                name="barcode"
                placeholder="Scan barcode / SKU…"
                className="pl-9 rounded-full h-9 text-sm"
                value={barcodeInput}
                onChange={e => setBarcodeInput(e.target.value)}
                onKeyDown={handleBarcodeSearch}
              />
            </div>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="pos-search"
                name="search"
                placeholder="Search products…"
                className="pl-9 rounded-full h-9 text-sm"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>

          {/* Category tabs */}
          <div className="px-4 pb-2 shrink-0">
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {categories.map(cat => {
                const emoji = CATEGORY_ICONS[cat] ?? "📦";
                const isActive = activeCategory === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all border shrink-0",
                      isActive
                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                        : "bg-muted/50 text-muted-foreground border-transparent hover:border-border hover:bg-muted hover:text-foreground"
                    )}
                  >
                    {cat !== "All" && <span className="text-sm leading-none">{emoji}</span>}
                    {cat}
                    <span className={cn("text-[10px] rounded-full px-1", isActive ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground")}>
                      {cat === "All" ? allProducts.length : allProducts.filter(p => p.category === cat).length}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Product grid */}
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            {productsLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-36 rounded-2xl bg-muted animate-pulse" />
                ))}
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
                <Package className="h-10 w-10 opacity-30" />
                <p className="font-medium text-foreground">No products found</p>
                {search && <Button variant="ghost" size="sm" className="rounded-full" onClick={() => setSearch("")}>Clear search</Button>}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                {filteredProducts.map(p => (
                  <ProductCard
                    key={p.id}
                    product={{ id: p.id, name: p.name, price: Number(p.price), stock: p.stock, sku: p.sku ?? null, category: p.category ?? null }}
                    inCart={cart.find(c => c.id === p.id)?.quantity ?? 0}
                    onClick={() => addToCart(p)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — Order Panel */}
        <div className={cn("flex-col bg-card overflow-hidden md:w-[320px] xl:w-[360px] md:shrink-0", mobileView === "cart" ? "flex w-full" : "hidden md:flex")}>
          {/* Customer selector — pinned at top */}
          <div className="px-4 pt-3 pb-2 border-b shrink-0">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-1.5">
              <User className="h-3 w-3" /> Customer
            </label>
            <select
              value={selectedCustomerId}
              onChange={e => { setSelectedCustomerId(e.target.value); setLoyaltyRedeem(false); }}
              className="w-full text-sm rounded-[20px] border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="walkin">Walk-in Customer</option>
              {customersData?.data.map(c => (
                <option key={c.id} value={String(c.id)}>{c.name}</option>
              ))}
            </select>
            {selectedCustomer && pointsBalance > 0 && (
              <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-violet-600 dark:text-violet-400">
                <Star className="h-3 w-3" />
                <span className="font-medium">{pointsBalance.toLocaleString()} loyalty pts</span>
                <span className="text-muted-foreground">= {GHS(pointsBalance * 0.01)}</span>
              </div>
            )}
          </div>

          {/* Scrollable middle — cart items + discount + totals + payment */}
          <div className="flex-1 overflow-y-auto">
            {/* Cart items */}
            <div className="px-3 pt-2 pb-1 space-y-1.5">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-muted-foreground gap-2 py-8">
                  <ShoppingCart className="h-10 w-10 opacity-20" />
                  <p className="text-sm font-medium text-foreground">Cart is empty</p>
                  <p className="text-xs text-center">Click a product or scan a barcode to add items</p>
                </div>
              ) : cart.map(item => (
                <div key={item.id} className="flex items-center gap-2 px-3 py-2.5 bg-muted/40 rounded-xl hover:bg-muted/60 transition-colors group">
                  {/* Name + unit price */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate leading-snug">{item.name}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{GHS(item.price)} each</p>
                  </div>
                  {/* Qty stepper */}
                  <div className="flex flex-col items-center gap-0.5 shrink-0">
                    <span className="text-[9px] font-medium text-muted-foreground uppercase tracking-wide leading-none">Qty</span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => updateQty(item.id, -1)}
                        className="h-6 w-6 rounded-full bg-muted hover:bg-muted-foreground/20 flex items-center justify-center transition-colors">
                        <Minus className="h-3 w-3" />
                      </button>
                      <input
                        type="number"
                        id={`pos-qty-${item.id}`}
                        name={`qty-${item.id}`}
                        min={1}
                        max={item.stock}
                        value={item.quantity}
                        onChange={e => setQty(item.id, parseInt(e.target.value) || 0)}
                        className="w-9 text-center text-sm font-bold bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary py-0.5"
                      />
                      <button onClick={() => updateQty(item.id, 1)}
                        className="h-6 w-6 rounded-full bg-muted hover:bg-muted-foreground/20 flex items-center justify-center transition-colors">
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                  {/* Line total + delete */}
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <p className="text-xs font-bold text-primary">{GHS(item.price * item.quantity)}</p>
                    <button onClick={() => setCart(c => c.filter(i => i.id !== item.id))}
                      className="h-5 w-5 rounded-full flex items-center justify-center text-destructive opacity-0 group-hover:opacity-100 hover:bg-destructive/10 transition-all">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Divider before summary */}
            {cart.length > 0 && <div className="border-t mx-4 mt-1" />}

            {/* Discount + totals + payment */}
            <div className="px-4 pt-3 pb-3 space-y-3">
              {/* Discount row */}
              <div className="flex items-center gap-2">
                <Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <label className="text-xs text-muted-foreground whitespace-nowrap">Discount</label>
                <div className="flex flex-1 gap-1">
                  <button
                    onClick={() => setDiscountType("percent")}
                    className={cn("h-7 px-2 rounded-l-full rounded-r text-xs border transition-colors", discountType === "percent" ? "bg-primary text-primary-foreground border-primary" : "bg-muted border-border text-muted-foreground hover:text-foreground")}
                  >
                    <Percent className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => setDiscountType("fixed")}
                    className={cn("h-7 px-2 rounded-r-full rounded-l text-xs border transition-colors", discountType === "fixed" ? "bg-primary text-primary-foreground border-primary" : "bg-muted border-border text-muted-foreground hover:text-foreground")}
                  >
                    ₵
                  </button>
                  <Input
                    id="pos-discount"
                    name="discount"
                    type="number"
                    min={0}
                    max={discountType === "percent" ? 100 : undefined}
                    placeholder={discountType === "percent" ? "0%" : "0.00"}
                    value={discountValue}
                    onChange={e => setDiscountValue(e.target.value)}
                    className="flex-1 h-7 rounded-full text-xs px-3"
                  />
                </div>
              </div>

              {/* Loyalty redemption */}
              {selectedCustomer && pointsBalance > 0 && (
                <div className="flex items-center justify-between px-3 py-2 rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/20">
                  <div className="flex items-center gap-2">
                    <Gift className="h-3.5 w-3.5 text-violet-500" />
                    <div>
                      <p className="text-xs font-medium text-violet-700 dark:text-violet-300">Redeem Points</p>
                      <p className="text-[10px] text-violet-500">{pointsBalance} pts → {GHS(maxLoyaltyRedeemGHS)}</p>
                    </div>
                  </div>
                  <Switch checked={loyaltyRedeem} onCheckedChange={setLoyaltyRedeem} />
                </div>
              )}

              {/* Ghana VAT toggle */}
              <div className="flex items-center justify-between px-3 py-2 rounded-xl border border-border/60 bg-muted/20">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">Ghana VAT</span>
                  <Badge variant="outline" className="text-[9px] h-4 px-1">15%+2.5%+2.5%</Badge>
                </div>
                <Switch checked={taxEnabled} onCheckedChange={setTaxEnabled} />
              </div>

              {/* Totals */}
              <div className="bg-muted/30 rounded-xl px-3 py-2.5 space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{GHS(subtotal)}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-sm text-emerald-600">
                    <span>Discount {discountType === "percent" ? `(${discountValue}%)` : ""}</span>
                    <span>-{GHS(discountAmount)}</span>
                  </div>
                )}
                {loyaltyDiscount > 0 && (
                  <div className="flex justify-between text-sm text-violet-600">
                    <span>Loyalty ({loyaltyPointsRedeemed} pts)</span>
                    <span>-{GHS(loyaltyDiscount)}</span>
                  </div>
                )}
                {taxEnabled && (
                  <>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>VAT (15%)</span><span>{GHS(vatAmount)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>NHIL (2.5%)</span><span>{GHS(nhilAmount)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>GETFund (2.5%)</span><span>{GHS(getfundAmount)}</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between font-bold text-base border-t border-border/60 pt-1.5 mt-1">
                  <span>Total</span>
                  <span className="text-primary">{GHS(total)}</span>
                </div>
              </div>

              {/* Split payment toggle */}
              <div className="flex items-center justify-between px-3 py-2 rounded-xl border border-border/60 bg-muted/20">
                <div className="flex items-center gap-2">
                  <SplitSquareHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium">Split Payment</span>
                </div>
                <Switch checked={splitPayment} onCheckedChange={v => { setSplitPayment(v); setSplitAmount1(""); }} />
              </div>

              {/* Payment method(s) */}
              {splitPayment ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-1 font-medium">1st Payment</p>
                      <div className="grid grid-cols-2 gap-1">
                        {PAYMENT_METHODS.map(pm => (
                          <button
                            key={pm.id}
                            onClick={() => setPaymentMethod(pm.id)}
                            className={cn(
                              "flex flex-col items-center gap-0.5 py-1.5 px-1 rounded-lg border text-[9px] font-medium transition-all",
                              paymentMethod === pm.id ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground bg-muted/30"
                            )}
                          >
                            {pm.icon}
                            <span className="leading-none">{pm.label}</span>
                          </button>
                        ))}
                      </div>
                      <Input id="pos-split-amount-1" name="splitAmount1" type="number" min={0} max={total} step="0.01" placeholder={`Amount (₵)`} value={splitAmount1} onChange={e => setSplitAmount1(e.target.value)} className="mt-1.5 h-8 rounded-full text-xs px-3" />
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-1 font-medium">2nd Payment</p>
                      <div className="grid grid-cols-2 gap-1">
                        {PAYMENT_METHODS.map(pm => (
                          <button
                            key={pm.id}
                            onClick={() => setSecondPaymentMethod(pm.id)}
                            className={cn(
                              "flex flex-col items-center gap-0.5 py-1.5 px-1 rounded-lg border text-[9px] font-medium transition-all",
                              secondPaymentMethod === pm.id ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground bg-muted/30"
                            )}
                          >
                            {pm.icon}
                            <span className="leading-none">{pm.label}</span>
                          </button>
                        ))}
                      </div>
                      <div className={cn("mt-1.5 h-8 rounded-full px-3 flex items-center text-xs font-semibold", split2Num > 0 ? "bg-primary/10 text-primary" : "bg-muted/30 text-muted-foreground")}>
                        {split2Num > 0 ? GHS(split2Num) : "Remainder"}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-1.5">
                  {PAYMENT_METHODS.map(pm => (
                    <button
                      key={pm.id}
                      onClick={() => setPaymentMethod(pm.id)}
                      className={cn(
                        "flex flex-col items-center gap-1 py-2 px-1 rounded-xl border text-xs font-medium transition-all",
                        paymentMethod === pm.id
                          ? "bg-primary text-primary-foreground border-primary shadow-sm"
                          : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground bg-muted/30"
                      )}
                    >
                      {pm.icon}
                      <span className="text-[10px] leading-none">{pm.label}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Cash tendered / change (single payment only) */}
              {paymentMethod === "cash" && !splitPayment && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-muted-foreground whitespace-nowrap">Amount tendered (₵)</label>
                    <Input
                      id="pos-amount-tendered"
                      name="amountTendered"
                      type="number"
                      min={total}
                      step="0.01"
                      placeholder={GHS(total)}
                      value={amountTendered}
                      onChange={e => setAmountTendered(e.target.value)}
                      className="flex-1 h-8 rounded-full text-sm px-3"
                    />
                  </div>
                  {tenderedNum > 0 && (
                    <div className={cn(
                      "flex justify-between text-sm font-semibold px-2 py-1.5 rounded-lg",
                      tenderedNum >= total ? "bg-emerald-500/10 text-emerald-700" : "bg-red-500/10 text-red-600"
                    )}>
                      <span>{tenderedNum >= total ? "Change due" : "Amount short"}</span>
                      <span>{tenderedNum >= total ? GHS(change) : GHS(total - tenderedNum)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Charge button — pinned at bottom */}
          <div className="border-t px-4 py-3 shrink-0 space-y-2">
            <Button
              className="w-full rounded-full gap-2 h-11 text-sm font-bold"
              onClick={handleCheckout}
              disabled={cart.length === 0 || !canCharge || createSale.isPending}
            >
              {createSale.isPending ? (
                <>Processing…</>
              ) : (
                <>
                  <ChevronRight className="h-4 w-4" />
                  Charge {GHS(total)}
                </>
              )}
            </Button>
            {cart.length > 0 && (
              <div className="flex gap-2">
                <button
                  onClick={saveHeldSale}
                  className="flex-1 text-xs text-amber-600 hover:text-amber-700 dark:text-amber-400 flex items-center justify-center gap-1 py-1 transition-colors"
                >
                  <Pause className="h-3 w-3" /> Hold Sale
                </button>
                <button onClick={clearCart} className="flex-1 text-xs text-muted-foreground hover:text-destructive flex items-center justify-center gap-1 py-1 transition-colors">
                  <Trash2 className="h-3 w-3" /> Clear cart
                </button>
              </div>
            )}
            {heldSales.length > 0 && cart.length === 0 && (
              <button
                onClick={() => setHeldSalesOpen(true)}
                className="w-full text-xs text-amber-600 hover:text-amber-700 dark:text-amber-400 flex items-center justify-center gap-1.5 py-1.5 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 transition-colors"
              >
                <Clock className="h-3 w-3" />
                {heldSales.length} sale{heldSales.length !== 1 ? "s" : ""} on hold — tap to resume
              </button>
            )}
          </div>
        </div>
      </div>

      <ReceiptDialog
        open={receiptOpen}
        receipt={lastReceipt}
        onClose={() => setReceiptOpen(false)}
        onNewSale={() => { setReceiptOpen(false); setSelectedCustomerId("walkin"); barcodeRef.current?.focus(); }}
      />
      <HeldSalesDialog
        open={heldSalesOpen}
        onClose={() => setHeldSalesOpen(false)}
        heldSales={heldSales}
        onResume={resumeHeldSale}
        onDelete={deleteHeldSale}
      />
    </div>
  );
}
