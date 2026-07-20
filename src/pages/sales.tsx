// @ts-nocheck
import { useState, useEffect } from "react";
import {
  useListSales,
  useCreateSale,
  useUpdateSale,
  useDeleteSale,
  getListSalesQueryKey,
  useListProducts,
  useListCustomers,
} from "@/workspace/api-client-react";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Search,
  Plus,
  ShoppingCart,
  Loader2,
  Trash2,
  MoreHorizontal,
  Pencil,
  Upload,
  Printer,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { FileImportDialog } from "@/components/FileImportDialog";

type StatusFilter = "all" | "pending" | "completed" | "cancelled";
type SaleStatus = "pending" | "completed" | "cancelled";

const saleSchema = z.object({
  customerId: z.coerce.number().min(1, "Customer is required"),
  items: z
    .array(
      z.object({
        productId: z.string().min(1, "Product is required"),
        quantity: z.coerce.number().min(1, "Quantity must be at least 1"),
        unitPrice: z.coerce.number().min(0),
      }),
    )
    .min(1, "At least one item is required"),
  tax: z.coerce.number().min(0).optional().default(0),
  notes: z.string().optional(),
  status: z.enum(["pending", "completed", "cancelled"]).default("completed"),
});

type SaleForm = z.infer<typeof saleSchema>;

export default function Sales() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [editingSaleId, setEditingSaleId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(handler);
  }, [search]);

  const queryParams = {
    page,
    limit: 10,
    search: debouncedSearch || undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
  };

  const { data: salesResponse, isLoading } = useListSales(queryParams, {
    query: { queryKey: getListSalesQueryKey(queryParams) },
  });

  const { data: customersResponse } = useListCustomers({ limit: 100 });
  const { data: productsResponse } = useListProducts({ limit: 100 });

  const createMutation = useCreateSale();
  const updateMutation = useUpdateSale();
  const deleteMutation = useDeleteSale();

  const form = useForm<SaleForm>({
    resolver: zodResolver(saleSchema),
    defaultValues: {
      customerId: 0,
      items: [{ productId: "", quantity: 1, unitPrice: 0 }],
      tax: 0,
      notes: "",
      status: "completed",
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListSalesQueryKey() });

  const onCreateSubmit = (values: SaleForm) => {
    createMutation.mutate(
      { data: values },
      {
        onSuccess: () => {
          toast({ title: "Sale created successfully" });
          setIsCreateOpen(false);
          form.reset();
          invalidate();
        },
        onError: (err) =>
          toast({ variant: "destructive", title: "Error creating sale", description: err.message }),
      },
    );
  };

  const onStatusChange = (saleId: number, status: SaleStatus) => {
    updateMutation.mutate(
      { id: saleId, data: { status } },
      {
        onSuccess: () => {
          toast({ title: `Sale marked as ${status}` });
          invalidate();
        },
        onError: (err) =>
          toast({ variant: "destructive", title: "Error", description: err.message }),
      },
    );
  };

  const onDelete = () => {
    if (deletingId === null) return;
    deleteMutation.mutate(
      { id: deletingId },
      {
        onSuccess: () => {
          toast({ title: "Sale deleted" });
          setDeletingId(null);
          invalidate();
        },
        onError: (err) =>
          toast({ variant: "destructive", title: "Error", description: err.message }),
      },
    );
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" }).format(value);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const printReceipt = (sale: any) => {
    const items = Array.isArray((sale as Record<string, unknown>).items)
      ? ((sale as Record<string, unknown>).items as {
          productName?: string;
          quantity: number;
          unitPrice: number;
          total: number;
        }[])
      : [];
    const saleDate = (sale as Record<string, unknown>).saleDate
      ? new Date((sale as Record<string, unknown>).saleDate as string).toLocaleDateString("en-GH", {
          day: "2-digit",
          month: "long",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : new Date((sale as Record<string, unknown>).createdAt as string).toLocaleDateString(
          "en-GH",
          { day: "2-digit", month: "long", year: "numeric" },
        );
    const GHS = (n: number) =>
      new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" }).format(n);
    const subtotal = Number((sale as Record<string, unknown>).subtotal ?? 0);
    const tax = Number((sale as Record<string, unknown>).tax ?? 0);
    const total = Number((sale as Record<string, unknown>).total ?? 0);
    const paymentMethod =
      ((sale as Record<string, unknown>).paymentMethod as string | null) ??
      ((sale as Record<string, unknown>).channel as string | null) ??
      "—";
    const itemRows = items
      .map(
        (i) =>
          `<tr>
        <td style="padding:4px 6px;font-size:12px">${i.productName ?? "Item"}</td>
        <td style="padding:4px 6px;text-align:center;font-size:12px">${i.quantity}</td>
        <td style="padding:4px 6px;text-align:right;font-size:12px">${GHS(i.unitPrice)}</td>
        <td style="padding:4px 6px;text-align:right;font-size:12px">${GHS(i.total)}</td>
      </tr>`,
      )
      .join("");
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Receipt — ${(sale as Record<string, unknown>).invoiceNumber}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:'Courier New',monospace;font-size:13px;background:#fff;color:#111;padding:20px;max-width:380px;margin:0 auto}
      .header{text-align:center;margin-bottom:12px;border-bottom:2px dashed #333;padding-bottom:12px}
      .header h1{font-size:18px;font-weight:bold;letter-spacing:1px}
      .header p{font-size:11px;color:#555;margin-top:3px}
      .meta{margin:10px 0;font-size:11px;display:flex;flex-direction:column;gap:3px}
      .meta-row{display:flex;justify-content:space-between}
      table{width:100%;border-collapse:collapse;margin:10px 0}
      thead tr{border-bottom:1px solid #333}
      th{font-size:11px;padding:4px 6px;text-align:left;font-weight:bold}
      th:last-child,th:nth-child(3),th:nth-child(2){text-align:right}
      td:last-child,td:nth-child(3),td:nth-child(2){text-align:right}
      .divider{border:none;border-top:1px dashed #aaa;margin:8px 0}
      .totals{font-size:12px;display:flex;flex-direction:column;gap:3px;align-items:flex-end}
      .totals .total-row{display:flex;gap:40px;justify-content:space-between;min-width:220px}
      .totals .grand{font-weight:bold;font-size:14px;border-top:1px solid #333;padding-top:4px;margin-top:4px}
      .footer{text-align:center;margin-top:14px;border-top:2px dashed #333;padding-top:12px;font-size:11px;color:#555}
      @media print{body{padding:0}button{display:none}}
    </style></head><body>
    <div class="header">
      <h1>INFINITY SALES &amp; INVENTORY</h1>
      <p>Tax Invoice / Receipt</p>
    </div>
    <div class="meta">
      <div class="meta-row"><span>Invoice:</span><strong>${(sale as Record<string, unknown>).invoiceNumber}</strong></div>
      <div class="meta-row"><span>Date:</span><span>${saleDate}</span></div>
      <div class="meta-row"><span>Customer:</span><span>${(sale as Record<string, unknown>).customerName ?? "Walk-in"}</span></div>
      <div class="meta-row"><span>Payment:</span><span style="text-transform:capitalize">${paymentMethod}</span></div>
    </div>
    <hr class="divider"/>
    <table>
      <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
      <tbody>${itemRows || `<tr><td colspan="4" style="text-align:center;padding:8px;font-size:11px;color:#888">No line items recorded</td></tr>`}</tbody>
    </table>
    <hr class="divider"/>
    <div class="totals">
      <div class="total-row"><span>Subtotal</span><span>${GHS(subtotal)}</span></div>
      <div class="total-row"><span>Tax / VAT</span><span>${GHS(tax)}</span></div>
      <div class="total-row grand"><span>TOTAL</span><span>${GHS(total)}</span></div>
    </div>
    <div class="footer">
      <p>Thank you for shopping with us!</p>
      <p style="margin-top:4px">Powered by Infinity Techub Intelligence</p>
    </div>
    <script>window.onload=()=>{setTimeout(()=>window.print(),300)}</script>
    </body></html>`;
    const w = window.open("", "_blank", "width=420,height=700,scrollbars=yes");
    if (!w) {
      toast({
        title: "Pop-up blocked",
        description: "Allow pop-ups to print receipts",
        variant: "destructive",
      });
      return;
    }
    w.document.write(html);
    w.document.close();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <Badge className="bg-green-500/10 text-green-700 hover:bg-green-500/20 border-green-500/20">
            Completed
          </Badge>
        );
      case "pending":
        return <Badge variant="secondary">Pending</Badge>;
      case "cancelled":
        return (
          <Badge
            variant="destructive"
            className="bg-red-500/10 text-red-700 hover:bg-red-500/20 border-red-500/20"
          >
            Cancelled
          </Badge>
        );
      default:
        return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Sales</h2>
          <p className="text-muted-foreground">Manage your transactions and invoices.</p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="rounded-full gap-2"
            onClick={() => setIsImportOpen(true)}
          >
            <Upload className="h-4 w-4" /> Import
          </Button>
          <FileImportDialog
            type="sales"
            open={isImportOpen}
            onClose={() => setIsImportOpen(false)}
            onSuccess={invalidate}
          />

          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-full gap-2">
                <Plus className="h-4 w-4" /> New Sale
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create New Sale</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onCreateSubmit)} className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="customerId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Customer</FormLabel>
                          <Select
                            onValueChange={(val) => field.onChange(parseInt(val))}
                            defaultValue={field.value ? field.value.toString() : ""}
                          >
                            <FormControl>
                              <SelectTrigger className="rounded-[20px]">
                                <SelectValue placeholder="Select a customer" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {customersResponse?.data.map((c) => (
                                <SelectItem key={c.id} value={c.id.toString()}>
                                  {c.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="status"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Status</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger className="rounded-[20px]">
                                <SelectValue placeholder="Select status" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="completed">Completed</SelectItem>
                              <SelectItem value="cancelled">Cancelled</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <h3 className="text-sm font-medium">Items</h3>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-full h-8"
                        onClick={() => append({ productId: "", quantity: 1, unitPrice: 0 })}
                      >
                        <Plus className="h-3 w-3 mr-1" /> Add Item
                      </Button>
                    </div>

                    {fields.map((field, index) => (
                      <div
                        key={field.id}
                        className="flex flex-wrap gap-2 items-end bg-muted/30 p-3 rounded-2xl border"
                      >
                        <FormField
                          control={form.control}
                          name={`items.${index}.productId`}
                          render={({ field: f }) => (
                            <FormItem className="flex-1">
                              <FormLabel className="text-xs">Product</FormLabel>
                              <Select
                                onValueChange={(val) => {
                                  f.onChange(val);
                                  const p = productsResponse?.data.find((p) => p.id === val);
                                  if (p) form.setValue(`items.${index}.unitPrice`, p.price);
                                }}
                                defaultValue={f.value ?? ""}
                              >
                                <FormControl>
                                  <SelectTrigger className="rounded-[20px]">
                                    <SelectValue placeholder="Select product" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {productsResponse?.data.map((p) => (
                                    <SelectItem key={p.id} value={p.id}>
                                      {p.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`items.${index}.quantity`}
                          render={({ field: f }) => (
                            <FormItem className="w-24">
                              <FormLabel className="text-xs">Qty</FormLabel>
                              <FormControl>
                                <Input type="number" min="1" {...f} className="rounded-[20px]" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`items.${index}.unitPrice`}
                          render={({ field: f }) => (
                            <FormItem className="w-32">
                              <FormLabel className="text-xs">Price</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  {...f}
                                  className="rounded-[20px]"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0 mb-0.5 rounded-full"
                          onClick={() => remove(index)}
                          disabled={fields.length === 1}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="tax"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Tax Amount</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
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
                      name="notes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Notes (Optional)</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Invoice notes..."
                              {...field}
                              className="rounded-[20px]"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-4 border-t">
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-full"
                      onClick={() => setIsCreateOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      className="rounded-full"
                      disabled={createMutation.isPending}
                    >
                      {createMutation.isPending && (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      )}
                      Create Sale
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <AlertDialog
        open={deletingId !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete sale?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this sale record and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={onDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card>
        <CardHeader className="pb-3 border-b">
          <div className="flex flex-col sm:flex-row justify-between gap-4">
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="sales-search"
                name="search"
                placeholder="Search invoice number..."
                className="pl-9 rounded-full bg-muted/50 border-transparent focus-visible:bg-background focus-visible:border-primary"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <SelectTrigger className="w-[140px] rounded-full">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table className="min-w-[560px]">
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead className="w-[140px]">Invoice</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <div className="h-4 w-20 bg-muted animate-pulse rounded" />
                    </TableCell>
                    <TableCell>
                      <div className="h-4 w-32 bg-muted animate-pulse rounded" />
                    </TableCell>
                    <TableCell>
                      <div className="h-4 w-24 bg-muted animate-pulse rounded" />
                    </TableCell>
                    <TableCell>
                      <div className="h-6 w-20 bg-muted animate-pulse rounded-full" />
                    </TableCell>
                    <TableCell>
                      <div className="h-4 w-16 bg-muted animate-pulse rounded ml-auto" />
                    </TableCell>
                    <TableCell />
                  </TableRow>
                ))
              ) : salesResponse?.data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-[400px] text-center">
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                      <div className="h-16 w-16 bg-muted rounded-full flex items-center justify-center mb-4">
                        <ShoppingCart className="h-8 w-8 text-muted-foreground/50" />
                      </div>
                      <p className="text-lg font-medium text-foreground">No sales found</p>
                      <p className="text-sm">No sales match your current filters.</p>
                      <Button
                        variant="outline"
                        className="mt-4 rounded-full"
                        onClick={() => setIsCreateOpen(true)}
                      >
                        Create a sale
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                salesResponse?.data.map((sale) => (
                  <TableRow key={sale.id} className="hover:bg-muted/50 transition-colors">
                    <TableCell className="font-medium font-mono text-sm">
                      {sale.invoiceNumber}
                    </TableCell>
                    <TableCell>{sale.customerName}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {sale.saleDate
                        ? format(new Date(sale.saleDate), "MMM d, yyyy")
                        : format(new Date(sale.createdAt), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell>{getStatusBadge(sale.status)}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(sale.total)}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => printReceipt(sale)}>
                            <Printer className="h-4 w-4 mr-2" /> Print Receipt
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {sale.status !== "completed" && (
                            <DropdownMenuItem onClick={() => onStatusChange(sale.id, "completed")}>
                              <Pencil className="h-4 w-4 mr-2" /> Mark Completed
                            </DropdownMenuItem>
                          )}
                          {sale.status !== "pending" && (
                            <DropdownMenuItem onClick={() => onStatusChange(sale.id, "pending")}>
                              <Pencil className="h-4 w-4 mr-2" /> Mark Pending
                            </DropdownMenuItem>
                          )}
                          {sale.status !== "cancelled" && (
                            <DropdownMenuItem onClick={() => onStatusChange(sale.id, "cancelled")}>
                              <Pencil className="h-4 w-4 mr-2" /> Cancel Sale
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeletingId(sale.id)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" /> Delete
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
        {salesResponse && salesResponse.total > salesResponse.limit && (
          <div className="p-4 border-t flex justify-between items-center">
            <span className="text-sm text-muted-foreground">
              Showing {(page - 1) * salesResponse.limit + 1}–
              {Math.min(page * salesResponse.limit, salesResponse.total)} of {salesResponse.total}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                disabled={page * salesResponse.limit >= salesResponse.total}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
