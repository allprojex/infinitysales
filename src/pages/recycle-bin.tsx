import { useState } from "react";
import { customFetch } from "@/workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Trash2,
  RotateCcw,
  AlertTriangle,
  Package,
  Users,
  ShoppingCart,
  Layers,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

type RecycleBinItem = {
  id: number;
  entityType: string;
  entityId: number;
  entityName: string | null;
  entityData: Record<string, unknown>;
  deletedById: number | null;
  deletedByName: string | null;
  deletedAt: string;
};

const ENTITY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  product: Package,
  customer: Users,
  sale: ShoppingCart,
};

const ENTITY_COLORS: Record<string, string> = {
  product: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  customer: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  sale: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
};

export default function RecycleBin() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [entityType, setEntityType] = useState("all");
  const [page, setPage] = useState(1);

  const queryKey = ["recycle-bin", page, entityType];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (entityType !== "all") params.set("entityType", entityType);
      return customFetch<{ data: RecycleBinItem[]; total: number; page: number; limit: number }>(
        `/api/recycle-bin?${params}`,
      );
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["recycle-bin"] });

  const handleRestore = async (item: RecycleBinItem) => {
    try {
      await customFetch(`/api/recycle-bin/${item.id}/restore`, { method: "POST" });
      toast({
        title: "Restored!",
        description: `"${item.entityName ?? item.entityType}" has been restored.`,
      });
      refresh();
    } catch {
      toast({
        title: "Restore failed",
        description: "Unable to restore item. It may conflict with existing records.",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (item: RecycleBinItem) => {
    try {
      await customFetch(`/api/recycle-bin/${item.id}`, { method: "DELETE" });
      toast({
        title: "Permanently Deleted",
        description: `"${item.entityName ?? item.entityType}" was deleted forever.`,
        variant: "destructive",
      });
      refresh();
    } catch {
      toast({ title: "Error", description: "Could not delete item.", variant: "destructive" });
    }
  };

  const handleEmptyBin = async () => {
    try {
      await customFetch("/api/recycle-bin", { method: "DELETE" });
      toast({
        title: "Recycle Bin Emptied",
        description: "All items have been permanently deleted.",
        variant: "destructive",
      });
      refresh();
    } catch {
      toast({
        title: "Error",
        description: "Could not empty recycle bin.",
        variant: "destructive",
      });
    }
  };

  const items = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Recycle Bin</h2>
          <p className="text-muted-foreground">
            Restore or permanently delete items moved to the bin.
          </p>
        </div>
        {total > 0 && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" className="gap-2">
                <Trash2 className="h-4 w-4" />
                Empty Bin
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Empty Recycle Bin?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete all {total} items. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleEmptyBin}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete All Permanently
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "All Items", type: "all", icon: Layers, count: total },
          {
            label: "Products",
            type: "product",
            icon: Package,
            count: items.filter((i) => i.entityType === "product").length,
          },
          {
            label: "Customers",
            type: "customer",
            icon: Users,
            count: items.filter((i) => i.entityType === "customer").length,
          },
          {
            label: "Sales",
            type: "sale",
            icon: ShoppingCart,
            count: items.filter((i) => i.entityType === "sale").length,
          },
        ].map((card) => (
          <Card
            key={card.type}
            className={`cursor-pointer transition-all ${entityType === card.type ? "ring-2 ring-primary" : "hover:shadow-md"}`}
            onClick={() => {
              setEntityType(card.type);
              setPage(1);
            }}
          >
            <CardContent className="pt-4 pb-3 flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <card.icon className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-lg font-bold">
                  {card.type === "all"
                    ? total
                    : items.filter((i) => i.entityType === card.type).length}
                </p>
                <p className="text-xs text-muted-foreground">{card.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3 border-b gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-destructive" />
              Deleted Items
            </CardTitle>
            <CardDescription className="text-xs mt-0.5">
              {total} item{total !== 1 ? "s" : ""} in recycle bin
            </CardDescription>
          </div>
          <Select
            value={entityType}
            onValueChange={(v) => {
              setEntityType(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[160px] h-8 text-xs rounded-full">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="product">Products</SelectItem>
              <SelectItem value="customer">Customers</SelectItem>
              <SelectItem value="sale">Sales</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Loading...</div>
          ) : items.length === 0 ? (
            <div className="p-10 flex flex-col items-center gap-2 text-muted-foreground">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                <Trash2 className="h-6 w-6" />
              </div>
              <p className="font-medium">Recycle bin is empty</p>
              <p className="text-xs">Items you delete will appear here for recovery.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[100px]">Type</TableHead>
                      <TableHead>Name / ID</TableHead>
                      <TableHead>Deleted By</TableHead>
                      <TableHead>Deleted At</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => {
                      const Icon = ENTITY_ICONS[item.entityType] ?? Layers;
                      return (
                        <TableRow key={item.id}>
                          <TableCell>
                            <Badge
                              className={`text-[10px] gap-1 ${ENTITY_COLORS[item.entityType] ?? "bg-secondary text-secondary-foreground"}`}
                            >
                              <Icon className="h-3 w-3" />
                              {item.entityType}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <p className="font-medium text-sm">
                              {item.entityName ?? `#${item.entityId}`}
                            </p>
                            <p className="text-xs text-muted-foreground">ID: {item.entityId}</p>
                          </TableCell>
                          <TableCell className="text-sm">{item.deletedByName ?? "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {format(new Date(item.deletedAt), "MMM d, yyyy HH:mm")}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs gap-1"
                                onClick={() => handleRestore(item)}
                              >
                                <RotateCcw className="h-3 w-3" />
                                Restore
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 gap-1"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                    Delete
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle className="flex items-center gap-2">
                                      <AlertTriangle className="h-5 w-5 text-destructive" />
                                      Permanently Delete?
                                    </AlertDialogTitle>
                                    <AlertDialogDescription>
                                      "{item.entityName ?? item.entityType}" will be permanently
                                      deleted and cannot be recovered.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => handleDelete(item)}
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
                                      Delete Forever
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t text-sm">
                  <span className="text-muted-foreground">{total} total items</span>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      Previous
                    </Button>
                    <span className="px-2 py-1 text-xs text-muted-foreground">
                      Page {page} of {totalPages}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
