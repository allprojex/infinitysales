// @ts-nocheck
import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import {
  useListProducts,
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
  getListProductsQueryKey,
} from "@/workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Search, Plus, Package, Loader2, Tag, Layers, MoreVertical, Pencil, Trash2, Barcode, RefreshCw, Wand2, Hash, Calendar, AlertTriangle, Sparkles, ImagePlus, CheckCircle, RotateCcw, X, Wifi, ImageOff, Upload, ExternalLink } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { ProductBulkUploadDialog } from "@/components/ProductBulkUploadDialog";

import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { customFetch } from "@/workspace/api-client-react";

function generateSKU(): string {
  const alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const alnum = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const rand = (chars: string, len: number) =>
    Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `${rand(alpha, 3)}-${rand(alnum, 3)}-${rand("0123456789", 4)}`;
}

function generateEAN13(): string {
  const digits = Array.from({ length: 12 }, (_, i) =>
    i === 0 ? Math.floor(Math.random() * 9) : Math.floor(Math.random() * 10)
  );
  const sum = digits.reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0);
  const check = (10 - (sum % 10)) % 10;
  return [...digits, check].join("");
}

function generateSerialNumber(): string {
  const now = new Date();
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const hex = Array.from({ length: 8 }, () => Math.floor(Math.random() * 16).toString(16).toUpperCase()).join("");
  return `SN-${date}-${hex}`;
}

type ProductRow = {
  id: number;
  name: string;
  description: string | null;
  category: string | null;
  brand: string | null;
  unit: string | null;
  price: number;
  cost: number | null;
  sellingPrice: number | null;
  wholesalePrice: number | null;
  stock: number;
  sku: string | null;
  barcode: string | null;
  reorderPoint: number;
  trackSerial: boolean;
  expiryDate: string | null;
  batchLotNumber: string | null;
  imageUrl: string | null;
  thumbnailUrl?: string | null;
};

const productSchema = z.object({
  name: z.string().min(2, "Name is required"),
  description: z.string().optional(),
  category: z.string().optional(),
  brand: z.string().optional(),
  unit: z.string().optional(),
  price: z.coerce.number().min(0, "Price must be >= 0"),
  cost: z.coerce.number().min(0, "Must be >= 0").optional(),
  sellingPrice: z.coerce.number().min(0, "Must be >= 0").optional(),
  wholesalePrice: z.coerce.number().min(0, "Must be >= 0").optional(),
  stock: z.coerce.number().int().min(0, "Stock must be >= 0"),
  sku: z.string().optional(),
  barcode: z.string().optional(),
  reorderPoint: z.coerce.number().int().min(0, "Must be >= 0").default(10),
  trackSerial: z.boolean().default(false),
  expiryDate: z.string().optional(),
  batchLotNumber: z.string().optional(),
  imageUrl: z.string().optional(),
});


type ProductForm = z.infer<typeof productSchema>;

function StockStatus({ stock, reorderPoint }: { stock: number; reorderPoint: number }) {
  if (stock === 0) return <Badge variant="destructive" className="text-[10px]">Out of Stock</Badge>;
  if (stock <= reorderPoint) return (
    <Badge className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300 border-0">
      Low Stock
    </Badge>
  );
  return null;
}

type ProductImagePanelHandle = { triggerGenerate: () => void };

const ProductImagePanel = forwardRef<ProductImagePanelHandle, { f: ReturnType<typeof useForm<ProductForm>> }>(function ProductImagePanel({ f }, ref) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationFailed, setGenerationFailed] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const { toast } = useToast();

  const currentImageUrl = f.watch("imageUrl");
  const name = f.watch("name");
  const category = f.watch("category");
  const description = f.watch("description");
  const brand = f.watch("brand");
  const unit = f.watch("unit");

  const generateImage = async () => {
    if (!name || name.trim().length < 2) {
      toast({ variant: "destructive", title: "Enter a product name first", description: "The product name is used to generate the image." });
      return;
    }
    setIsGenerating(true);
    setShowPreview(false);
    setGenerationFailed(false);
    try {
      const data = await customFetch("/api/products/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, category, description, brand, unit }),
      }) as { imageUrl: string };
      setPreviewUrl(data.imageUrl);
      setShowPreview(true);
      setGenerationFailed(false);
    } catch (err) {
      setGenerationFailed(true);
      toast({ variant: "destructive", title: "Image generation failed", description: err instanceof Error ? err.message : "Please try again." });
    } finally {
      setIsGenerating(false);
    }
  };

  const useImage = () => {
    if (previewUrl) {
      f.setValue("imageUrl", previewUrl, { shouldDirty: true });
      setShowPreview(false);
      setPreviewUrl(null);
      setGenerationFailed(false);
      toast({ title: "Image applied", description: "Save the product to keep it." });
    }
  };

  const removeImage = () => {
    f.setValue("imageUrl", "", { shouldDirty: true });
    setPreviewUrl(null);
    setShowPreview(false);
    setGenerationFailed(false);
  };

  useImperativeHandle(ref, () => ({ triggerGenerate: generateImage }));

  return (
    <div className="rounded-xl border border-dashed p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ImagePlus className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium">Product Image</span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-full gap-1.5 text-xs h-7 px-3"
          onClick={generateImage}
          disabled={isGenerating}
        >
          {isGenerating ? (
            <><Loader2 className="h-3 w-3 animate-spin" /> Generating…</>
          ) : (
            <><Sparkles className="h-3 w-3 text-violet-500" /> {currentImageUrl ? "Regenerate" : "Generate with AI"}</>
          )}
        </Button>
      </div>

      {isGenerating && (
        <div className="flex flex-col items-center justify-center py-8 gap-3 bg-muted/30 rounded-lg">
          <div className="h-12 w-12 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
            <Sparkles className="h-6 w-6 text-violet-500 animate-pulse" />
          </div>
          <p className="text-sm text-muted-foreground">Creating a retail-ready image…</p>
        </div>
      )}

      {!isGenerating && generationFailed && (
        <div className="flex flex-col items-center justify-center py-6 gap-2 bg-destructive/5 border border-destructive/20 rounded-lg">
          <AlertTriangle className="h-6 w-6 text-destructive/70" />
          <p className="text-xs text-destructive/80 font-medium">Image generation failed</p>
          <p className="text-xs text-muted-foreground text-center px-2">
            Could not connect to the AI image service. You can try again or upload an image URL manually.
          </p>
          <Button type="button" variant="outline" size="sm" className="rounded-full gap-1.5 text-xs h-7 mt-1" onClick={generateImage}>
            <RotateCcw className="h-3 w-3" /> Try Again
          </Button>
        </div>
      )}

      {!isGenerating && !generationFailed && showPreview && previewUrl && (
        <div className="space-y-3">
          <div className="relative rounded-lg overflow-hidden bg-muted/20 border aspect-square max-h-48 mx-auto w-48">
            <img src={previewUrl} alt="Generated preview" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/0 hover:bg-black/10 transition-colors" />
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" className="flex-1 rounded-full gap-1.5 text-xs h-8" onClick={useImage}>
              <CheckCircle className="h-3 w-3" /> Use This Image
            </Button>
            <Button type="button" variant="outline" size="sm" className="rounded-full gap-1.5 text-xs h-8 px-3" onClick={generateImage} disabled={isGenerating}>
              <RotateCcw className="h-3 w-3" /> Regenerate
            </Button>
            <Button type="button" variant="ghost" size="sm" className="rounded-full h-8 w-8 p-0" onClick={() => setShowPreview(false)}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}

      {!isGenerating && !generationFailed && !showPreview && currentImageUrl && (
        <div className="flex items-center gap-3">
          <div className="h-14 w-14 rounded-lg overflow-hidden bg-muted border shrink-0">
            <img src={currentImageUrl} alt="Current" className="w-full h-full object-cover" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground">Current image set</p>
            <button type="button" onClick={removeImage} className="text-xs text-destructive hover:text-destructive/80 mt-0.5 flex items-center gap-1">
              <X className="h-3 w-3" /> Remove image
            </button>
          </div>
        </div>
      )}

      {!isGenerating && !generationFailed && !showPreview && !currentImageUrl && (
        <p className="text-xs text-muted-foreground text-center py-1">
          An AI image will be generated automatically when you save. Or click "Generate with AI" to preview one first.
        </p>
      )}
    </div>
  );
});

export default function Products() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isBulkUploadOpen, setIsBulkUploadOpen] = useState(false);

  const [editingProduct, setEditingProduct] = useState<ProductRow | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);
  const [showNoImageOnly, setShowNoImageOnly] = useState(false);

  const createPanelRef = useRef<ProductImagePanelHandle>(null);
  const editPanelRef = useRef<ProductImagePanelHandle>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(handler);
  }, [search]);

  const queryParams = {
    page,
    limit: 12,
    search: debouncedSearch || undefined,
    lowStock: showLowStockOnly || undefined,
    noImage: showNoImageOnly || undefined,
  };

  const { data: productsResponse, isLoading } = useListProducts(queryParams, {
    query: { queryKey: getListProductsQueryKey(queryParams) },
  });

  const createMutation = useCreateProduct();
  const updateMutation = useUpdateProduct();
  const deleteMutation = useDeleteProduct();

  const form = useForm<ProductForm>({
    resolver: zodResolver(productSchema),
    defaultValues: { name: "", description: "", category: "", brand: "", unit: "pcs", price: 0, cost: undefined, sellingPrice: undefined, wholesalePrice: undefined, stock: 0, sku: "", barcode: "", reorderPoint: 10, trackSerial: false, expiryDate: "", batchLotNumber: "", imageUrl: "" },
  });

  const editForm = useForm<ProductForm>({
    resolver: zodResolver(productSchema),
    defaultValues: { name: "", description: "", category: "", brand: "", unit: "pcs", price: 0, cost: undefined, sellingPrice: undefined, wholesalePrice: undefined, stock: 0, sku: "", barcode: "", reorderPoint: 10, trackSerial: false, expiryDate: "", batchLotNumber: "", imageUrl: "" },
  });

  const openEdit = (product: ProductRow) => {
    setEditingProduct(product);
    editForm.reset({
      name: product.name,
      description: product.description ?? "",
      category: product.category ?? "",
      brand: product.brand ?? "",
      unit: product.unit ?? "pcs",
      price: product.price,
      cost: product.cost ?? undefined,
      sellingPrice: product.sellingPrice ?? undefined,
      wholesalePrice: product.wholesalePrice ?? undefined,
      stock: product.stock,
      sku: product.sku ?? "",
      barcode: product.barcode ?? "",
      reorderPoint: product.reorderPoint,
      trackSerial: product.trackSerial ?? false,
      expiryDate: product.expiryDate ?? "",
      batchLotNumber: product.batchLotNumber ?? "",
      imageUrl: product.imageUrl ?? "",
    });
  };


  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
    // Bulk imports change rows visible to POS, Dashboard, Analytics, Reports
    // and inventory-aware tables. Realtime piggybacks on this too, but the
    // explicit fan-out makes the refresh deterministic on the same tab.
    queryClient.invalidateQueries({ predicate: (q) => {
      const k0 = String(q.queryKey?.[0] ?? "");
      return (
        k0.includes("/api/products") ||
        k0.includes("/api/reports") ||
        k0.includes("/api/sales") ||
        k0.includes("/api/purchase") ||
        k0.includes("report-summary") ||
        k0.includes("dead-stock") ||
        k0.includes("top-products")
      );
    }});
  };


  const [isBackfilling, setIsBackfilling] = useState(false);
  const runBackfill = async () => {
    if (isBackfilling) return;
    setIsBackfilling(true);
    let totalProcessed = 0;
    const totalFailures: { id: string; error: string }[] = [];
    try {
      toast({ title: "Auto-generating product images…", description: "This may take a few minutes." });
      // Loop until backend reports nothing left.
      // Safety cap to avoid infinite loops if remaining doesn't decrease.
      for (let i = 0; i < 200; i++) {
        const data = await customFetch("/api/products/backfill-images", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        }) as { processed: number; remaining: number; failures: { id: string; error: string }[]; batchSize: number };
        totalProcessed += data.processed;
        totalFailures.push(...data.failures);
        invalidate();
        if (data.batchSize === 0 || data.remaining === 0) break;
      }
      toast({
        title: "Image generation complete",
        description: `${totalProcessed} image(s) generated${totalFailures.length ? `, ${totalFailures.length} failed` : ""}.`,
      });
    } catch (e) {
      toast({ variant: "destructive", title: "Backfill failed", description: e instanceof Error ? e.message : "Unknown error" });
    } finally {
      setIsBackfilling(false);
    }
  };

  const onCreateSubmit = (values: ProductForm) => {
    createMutation.mutate({ data: values }, {
      onSuccess: async (product: { id: number }) => {
        toast({ title: "Product created successfully", description: values.imageUrl ? undefined : "An AI image is being generated in the background." });
        setIsCreateOpen(false);
        form.reset();
        invalidate();
        if (values.trackSerial && values.stock > 0) {
          const count = values.stock;
          try {
            await Promise.all(
              Array.from({ length: count }, () =>
                customFetch("/api/serial-numbers", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ productId: product.id, serialNumber: generateSerialNumber(), status: "available" }),
                })
              )
            );
            toast({ title: `${count} serial number${count !== 1 ? "s" : ""} generated`, description: "View them on the Serial Numbers page." });
          } catch {
            toast({ variant: "destructive", title: "Warning", description: "Product saved but some serial numbers failed to generate." });
          }
        }
      },
      onError: (err) => toast({ variant: "destructive", title: "Error", description: err.message }),
    });
  };

  const onEditSubmit = (values: ProductForm) => {
    if (!editingProduct) return;
    updateMutation.mutate({ id: editingProduct.id, data: values }, {
      onSuccess: () => {
        toast({ title: "Product updated" });
        setEditingProduct(null);
        invalidate();
      },
      onError: (err) => toast({ variant: "destructive", title: "Error", description: err.message }),
    });
  };

  const onDelete = () => {
    if (deletingId === null) return;
    deleteMutation.mutate({ id: deletingId }, {
      onSuccess: () => {
        toast({ title: "Product deleted" });
        setDeletingId(null);
        invalidate();
      },
      onError: (err) => toast({ variant: "destructive", title: "Error", description: err.message }),
    });
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" }).format(value);

  const productFormFields = (f: ReturnType<typeof useForm<ProductForm>>, panelRef?: React.Ref<ProductImagePanelHandle>) => (
    <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
      <ProductImagePanel ref={panelRef} f={f} />
      <FormField control={f.control} name="name" render={({ field }) => (
        <FormItem>
          <FormLabel>Product Name</FormLabel>
          <FormControl><Input placeholder="Pro Widget 2000" {...field} className="rounded-[20px]" /></FormControl>
          <FormMessage />
        </FormItem>
      )} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField control={f.control} name="brand" render={({ field }) => (
          <FormItem>
            <FormLabel>Brand</FormLabel>
            <FormControl><Input placeholder="e.g. Unilever" {...field} className="rounded-[20px]" /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={f.control} name="unit" render={({ field }) => (
          <FormItem>
            <FormLabel>Unit of Measure</FormLabel>
            <FormControl><Input placeholder="pcs / kg / litre" {...field} className="rounded-[20px]" /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField control={f.control} name="cost" render={({ field }) => (
          <FormItem>
            <FormLabel>Purchase Price (₵)</FormLabel>
            <FormControl>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="e.g. 75.00"
                {...field}
                value={field.value ?? ""}
                onChange={(e) => field.onChange(e.target.value === "" ? undefined : e.target.value)}
                className="rounded-[20px]"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={f.control} name="price" render={({ field }) => (
          <FormItem>
            <FormLabel>Selling Price (₵)</FormLabel>
            <FormControl><Input type="number" step="0.01" min="0" {...field} className="rounded-[20px]" /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField control={f.control} name="wholesalePrice" render={({ field }) => (
          <FormItem>
            <FormLabel>Wholesale Price (₵)</FormLabel>
            <FormControl>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="e.g. 90.00"
                {...field}
                value={field.value ?? ""}
                onChange={(e) => field.onChange(e.target.value === "" ? undefined : e.target.value)}
                className="rounded-[20px]"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={f.control} name="sellingPrice" render={({ field }) => (
          <FormItem>
            <FormLabel className="text-muted-foreground">Legacy selling price</FormLabel>
            <FormControl>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="Optional — kept for reports"
                {...field}
                value={field.value ?? ""}
                onChange={(e) => field.onChange(e.target.value === "" ? undefined : e.target.value)}
                className="rounded-[20px]"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField control={f.control} name="stock" render={({ field }) => (
          <FormItem>
            <FormLabel>Stock Quantity</FormLabel>
            <FormControl><Input type="number" min="0" {...field} className="rounded-[20px]" /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={f.control} name="reorderPoint" render={({ field }) => (
          <FormItem>
            <FormLabel>Reorder Point</FormLabel>
            <FormControl><Input type="number" min="0" placeholder="10" {...field} className="rounded-[20px]" /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField control={f.control} name="expiryDate" render={({ field }) => (
          <FormItem>
            <FormLabel className="flex items-center gap-1"><Calendar className="h-3 w-3" /> Expiry Date</FormLabel>
            <FormControl><Input type="date" {...field} className="rounded-[20px]" /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={f.control} name="batchLotNumber" render={({ field }) => (
          <FormItem>
            <FormLabel>Batch / Lot Number</FormLabel>
            <FormControl><Input placeholder="e.g. BATCH-2025-001" {...field} className="rounded-[20px]" /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField control={f.control} name="category" render={({ field }) => (
          <FormItem>
            <FormLabel>Category</FormLabel>
            <FormControl><Input placeholder="Electronics" {...field} className="rounded-[20px]" /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={f.control} name="sku" render={({ field }) => (
          <FormItem>
            <FormLabel className="flex items-center justify-between">
              SKU
              <button
                type="button"
                onClick={() => f.setValue("sku", generateSKU(), { shouldValidate: true })}
                className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-normal transition-colors"
              >
                <Wand2 className="h-3 w-3" /> Generate
              </button>
            </FormLabel>
            <FormControl><Input placeholder="EL-WDG-2000" {...field} className="rounded-[20px]" /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
      </div>
      <FormField control={f.control} name="barcode" render={({ field }) => (
        <FormItem>
          <FormLabel className="flex items-center justify-between">
            Barcode / QR
            <button
              type="button"
              onClick={() => f.setValue("barcode", generateEAN13(), { shouldValidate: true })}
              className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-normal transition-colors"
            >
              <Wand2 className="h-3 w-3" /> Generate
            </button>
          </FormLabel>
          <FormControl><Input placeholder="0012345678905" {...field} className="rounded-[20px]" /></FormControl>
          <FormMessage />
        </FormItem>
      )} />
      <FormField control={f.control} name="description" render={({ field }) => (
        <FormItem>
          <FormLabel>Description</FormLabel>
          <FormControl>
            <Textarea placeholder="Product description..." {...field} className="rounded-[20px] resize-none" rows={3} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )} />
      <FormField control={f.control} name="trackSerial" render={({ field }) => {
        const stockVal = Number(f.watch("stock") ?? 0);
        return (
          <FormItem className="rounded-xl border border-dashed p-4 space-y-0">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Hash className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <FormLabel className="font-medium cursor-pointer" htmlFor="trackSerial-switch">Track Serial Numbers</FormLabel>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {field.value && stockVal > 0
                      ? `${stockVal} serial number${stockVal !== 1 ? "s" : ""} will be auto-generated on save`
                      : "Auto-generate a unique serial number per unit of stock"}
                  </p>
                </div>
              </div>
              <FormControl>
                <Switch
                  id="trackSerial-switch"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
            </div>
          </FormItem>
        );
      }} />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Products</h2>
          <p className="text-muted-foreground">Manage your product catalog and inventory.</p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto flex-wrap">
          <div className="relative w-full sm:w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="products-search"
              name="search"
              placeholder="Search products..."
              className="pl-9 rounded-full bg-card border-transparent shadow-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button
            variant={showLowStockOnly ? "default" : "outline"}
            className="rounded-full gap-2 shrink-0"
            onClick={() => { setShowLowStockOnly(s => !s); setPage(1); }}
          >
            <RefreshCw className="h-4 w-4" />
            <span className="hidden sm:inline">{showLowStockOnly ? "All Products" : "Reorder Alerts"}</span>
          </Button>
          <Button
            variant={showNoImageOnly ? "default" : "outline"}
            className="rounded-full gap-2 shrink-0"
            onClick={() => { setShowNoImageOnly(s => !s); setPage(1); }}
          >
            <ImageOff className="h-4 w-4" />
            <span className="hidden sm:inline">{showNoImageOnly ? "All Products" : "No Image"}</span>
          </Button>
          <Button
            variant="outline"
            className="rounded-full gap-2 shrink-0"
            onClick={runBackfill}
            disabled={isBackfilling}
            title="Auto-generate images for all products that don't have one yet"
          >
            {isBackfilling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 text-violet-500" />}
            <span className="hidden sm:inline">{isBackfilling ? "Generating…" : "Auto-generate Images"}</span>
          </Button>
          <Button
            variant="outline"
            className="rounded-full gap-2 shrink-0"
            onClick={() => setIsBulkUploadOpen(true)}
            title="Upload a CSV or Excel file to add or update many products at once"
          >
            <Upload className="h-4 w-4" />
            <span className="hidden sm:inline">Import CSV/Excel</span>
          </Button>
          <Button variant="ghost" className="rounded-full gap-2 shrink-0" asChild title="Open the Import Portal for advanced review">
            <Link to="/import-portal"><ExternalLink className="h-4 w-4" /><span className="hidden lg:inline">Import Portal</span></Link>
          </Button>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>

            <DialogTrigger asChild>
              <Button className="rounded-full gap-2 shrink-0">
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Add Product</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    title="Click to generate an AI image"
                    onClick={() => createPanelRef.current?.triggerGenerate()}
                    className="h-16 w-16 rounded-2xl overflow-hidden bg-muted border border-dashed shrink-0 flex items-center justify-center hover:opacity-80 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {form.watch("imageUrl") ? (
                      <img src={form.watch("imageUrl")} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Package className="h-7 w-7 text-muted-foreground/40" />
                    )}
                  </button>
                  <DialogTitle>Add New Product</DialogTitle>
                </div>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onCreateSubmit)} className="space-y-4">
                  {productFormFields(form, createPanelRef)}
                  <div className="flex justify-end gap-2 pt-4">
                    <Button type="button" variant="outline" className="rounded-full" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                    <Button type="submit" className="rounded-full" disabled={createMutation.isPending}>
                      {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Save Product
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {showLowStockOnly && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl text-sm text-amber-700 dark:text-amber-300">
          <RefreshCw className="h-4 w-4 shrink-0" />
          Showing <strong>{productsResponse?.total ?? 0}</strong> product{(productsResponse?.total ?? 0) !== 1 ? "s" : ""} at or below their reorder point — restocking needed.
        </div>
      )}
      {showNoImageOnly && (
        <div className="flex items-center gap-2 p-3 bg-muted border border-muted-foreground/20 rounded-xl text-sm text-muted-foreground">
          <ImageOff className="h-4 w-4 shrink-0" />
          Showing <strong>{productsResponse?.total ?? 0}</strong> product{(productsResponse?.total ?? 0) !== 1 ? "s" : ""} without a photo — generate images to fill the gaps.
        </div>
      )}

      <Dialog open={!!editingProduct} onOpenChange={(open) => { if (!open) setEditingProduct(null); }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <div className="flex items-center gap-4">
              <button
                type="button"
                title="Click to generate an AI image"
                onClick={() => editPanelRef.current?.triggerGenerate()}
                className="h-16 w-16 rounded-2xl overflow-hidden bg-muted border border-dashed shrink-0 flex items-center justify-center hover:opacity-80 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {editForm.watch("imageUrl") ? (
                  <img src={editForm.watch("imageUrl")} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Package className="h-7 w-7 text-muted-foreground/40" />
                )}
              </button>
              <DialogTitle>Edit Product</DialogTitle>
            </div>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
              {productFormFields(editForm, editPanelRef)}
              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" className="rounded-full" onClick={() => setEditingProduct(null)}>Cancel</Button>
                <Button type="submit" className="rounded-full" disabled={updateMutation.isPending}>
                  {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Save Changes
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deletingId !== null} onOpenChange={(open) => { if (!open) setDeletingId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete product?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove this product and cannot be undone.</AlertDialogDescription>
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

      <ProductBulkUploadDialog
        open={isBulkUploadOpen}
        onClose={() => setIsBulkUploadOpen(false)}
        onSuccess={invalidate}
      />


      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="overflow-hidden border-transparent shadow-sm">
            <div className="aspect-square bg-muted animate-pulse" />
              <CardContent className="p-2.5 space-y-1.5">
                <div className="h-4 w-24 bg-muted animate-pulse rounded" />
                <div className="h-5 w-full bg-muted animate-pulse rounded" />
                <div className="h-4 w-16 bg-muted animate-pulse rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : productsResponse?.data.length === 0 ? (
        <div className="bg-card rounded-3xl border border-dashed border-muted-foreground/20 p-12 text-center">
          <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
            <Package className="h-8 w-8 text-muted-foreground/50" />
          </div>
          <h3 className="text-xl font-semibold mb-1">
            {showLowStockOnly ? "No reorder alerts" : showNoImageOnly ? "All products have photos" : "No products found"}
          </h3>
          <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
            {showLowStockOnly
              ? "All products are stocked above their reorder points."
              : showNoImageOnly
              ? "Every product in your catalogue already has an image."
              : "Get started by adding your first product to the catalog."}
          </p>
          {!showLowStockOnly && !showNoImageOnly && (
            <Button onClick={() => setIsCreateOpen(true)} className="rounded-full">
              <Plus className="h-4 w-4 mr-2" /> Add a product
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {productsResponse?.data.map((product) => {
              const p = product as unknown as ProductRow;
              const isLow = p.stock <= p.reorderPoint;
              return (
                <Card key={p.id} className="overflow-hidden flex flex-col group hover:shadow-md transition-shadow border-transparent shadow-sm">
                  <div className="aspect-square bg-muted/30 relative flex items-center justify-center overflow-hidden">
                    <div className={`absolute inset-0 mix-blend-multiply ${isLow ? "bg-gradient-to-tr from-amber-500/10 to-transparent" : "bg-gradient-to-tr from-primary/5 to-transparent"}`} />
                    {p.thumbnailUrl ? (
                      <img src={p.thumbnailUrl} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    ) : (
                      <Package className="h-16 w-16 text-primary/20 group-hover:scale-110 transition-transform duration-500" />
                    )}
                    {(p.stock === 0 || isLow) && (
                      <div className="absolute top-2 right-2">
                        <StockStatus stock={p.stock} reorderPoint={p.reorderPoint} />
                      </div>
                    )}
                    {p.expiryDate && (() => {
                      const exp = new Date(p.expiryDate);
                      const today = new Date();
                      const daysLeft = Math.ceil((exp.getTime() - today.getTime()) / 86400000);
                      if (daysLeft <= 30) return (
                        <div className="absolute bottom-2 left-2">
                          <Badge className={`text-[10px] gap-1 ${daysLeft <= 0 ? "bg-red-500 text-white" : daysLeft <= 7 ? "bg-orange-500 text-white" : "bg-amber-100 text-amber-700 border-0"}`}>
                            <AlertTriangle className="h-2.5 w-2.5" />
                            {daysLeft <= 0 ? "Expired" : `Exp ${daysLeft}d`}
                          </Badge>
                        </div>
                      );
                      return null;
                    })()}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="secondary"
                          size="icon"
                          className="absolute top-2 left-2 h-7 w-7 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                        >
                          <MoreVertical className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuItem onClick={() => openEdit(p)}>
                          <Pencil className="h-4 w-4 mr-2" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => {
                          customFetch("/api/esl/devices").then((devices: any[]) => {
                            if (!devices || devices.length === 0) {
                              toast({ title: "No ESL devices", description: "Register a device on the ESL Dashboard first." });
                              return;
                            }
                            const linked = devices.filter(d =>
                              d.status !== "offline" && (
                                (d.linkedProductId != null && Number(d.linkedProductId) === Number(p.id)) ||
                                (d.linkedProductSku && d.linkedProductSku === p.sku)
                              )
                            );
                            if (linked.length === 0) {
                              toast({ title: "No linked ESL devices", description: "Link a device to this product on the ESL Dashboard first." });
                              return;
                            }
                            Promise.all(linked.map(d =>
                              customFetch(`/api/esl/devices/${d.id}/push`, {
                                method: "POST",
                                body: JSON.stringify({ productName: p.name, price: Number(p.price), stock: p.stock, sku: p.sku, category: p.category }),
                                headers: { "Content-Type": "application/json" },
                              })
                            )).then(() => toast({ title: "Pushed to ESL", description: `Price & stock synced to ${linked.length} linked device(s).` }));
                          }).catch(() => toast({ title: "ESL push failed", variant: "destructive" }));
                        }}>
                          <Wifi className="h-4 w-4 mr-2" /> Push to ESL
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setDeletingId(p.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <CardContent className="p-2.5 flex-1 flex flex-col">
                    <div className="flex justify-between items-start mb-1 gap-1.5">
                      <h3 className="font-medium text-xs leading-tight line-clamp-2" title={p.name}>{p.name}</h3>
                      <span className="font-semibold text-xs text-primary shrink-0">{formatCurrency(p.price)}</span>
                    </div>
                    <div className="mt-auto pt-1.5 space-y-1">
                      <div className="flex flex-wrap gap-1 text-[10px] text-muted-foreground">
                        {p.category && (
                          <span className="flex items-center gap-0.5 bg-secondary px-1.5 py-0.5 rounded">
                            <Layers className="h-2.5 w-2.5" /> {p.category}
                          </span>
                        )}
                        <span className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded ${isLow ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300" : "bg-secondary"}`}>
                          <Tag className="h-2.5 w-2.5" /> {p.stock}
                        </span>
                      </div>
                      {p.barcode && (
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground/70">
                          <Barcode className="h-2.5 w-2.5" />
                          <span className="font-mono truncate">{p.barcode}</span>
                        </div>
                      )}
                      <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${p.stock === 0 ? "bg-destructive" : isLow ? "bg-amber-400" : "bg-emerald-500"}`}
                          style={{ width: `${Math.min((p.stock / Math.max(p.reorderPoint * 3, p.stock, 1)) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {productsResponse && productsResponse.total > productsResponse.limit && (
            <div className="flex justify-center pt-8">
              <div className="flex gap-2">
                <Button variant="outline" className="rounded-full bg-card shadow-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
                <Button variant="outline" className="rounded-full bg-card shadow-sm" disabled={page * productsResponse.limit >= productsResponse.total} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}