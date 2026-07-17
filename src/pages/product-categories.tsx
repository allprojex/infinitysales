import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@/workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { useToast } from "@/hooks/use-toast";
import {
  ArrowDownAZ,
  ArrowUpAZ,
  Layers,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";

type Category = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  productCount: number;
};
const emptyForm = { name: "", description: "" };

export default function ProductCategories() {
  const [search, setSearch] = useState("");
  const [ascending, setAscending] = useState(true);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirm, setConfirm] = useState<{
    category: Category;
    action: "toggle" | "delete";
  } | null>(null);
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useQuery<{ data: Category[] }>({
    queryKey: ["product-categories"],
    queryFn: () => customFetch("/api/product-categories"),
  });
  const categories = useMemo(
    () =>
      [...(data?.data ?? [])]
        .filter((c) => c.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
        .sort(
          (a, b) =>
            (ascending ? 1 : -1) * a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
        ),
    [data, search, ascending],
  );
  const refresh = () => qc.invalidateQueries({ queryKey: ["product-categories"] });
  const save = useMutation({
    mutationFn: () =>
      customFetch(editing ? `/api/product-categories/${editing.id}` : "/api/product-categories", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      }),
    onSuccess: () => {
      toast({ title: editing ? "Category updated" : "Category created" });
      setDialogOpen(false);
      setEditing(null);
      setForm(emptyForm);
      refresh();
    },
    onError: (error: Error) =>
      toast({
        variant: "destructive",
        title: "Could not save category",
        description: error.message,
      }),
  });
  const perform = useMutation({
    mutationFn: async ({ category, action }: NonNullable<typeof confirm>) =>
      action === "delete"
        ? customFetch(`/api/product-categories/${category.id}`, { method: "DELETE" })
        : customFetch(`/api/product-categories/${category.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isActive: !category.isActive }),
          }),
    onSuccess: () => {
      toast({
        title: confirm?.action === "delete" ? "Category deleted" : "Category status updated",
      });
      setConfirm(null);
      refresh();
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Action blocked", description: error.message });
      setConfirm(null);
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Product Categories</h2>
          <p className="text-muted-foreground">
            Organize the product catalogue and reporting structure.
          </p>
        </div>
        <Button
          className="rounded-full gap-2"
          onClick={() => {
            setEditing(null);
            setForm(emptyForm);
            setDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          Add Category
        </Button>
      </div>
      <div className="flex gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9 rounded-full"
            placeholder="Search categories…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          className="rounded-full"
          onClick={() => setAscending((v) => !v)}
          title={ascending ? "Sort Z–A" : "Sort A–Z"}
        >
          {ascending ? <ArrowDownAZ className="h-4 w-4" /> : <ArrowUpAZ className="h-4 w-4" />}
        </Button>
      </div>
      {isLoading ? (
        <div className="py-16 flex justify-center">
          <Loader2 className="animate-spin" />
        </div>
      ) : categories.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">No categories found.</div>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {categories.map((category) => (
            <Card key={category.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex gap-2">
                    <Layers className="h-5 w-5 text-primary mt-0.5" />
                    <div>
                      <h3 className="font-semibold">{category.name}</h3>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {category.description || "No description"}
                      </p>
                    </div>
                  </div>
                  <Badge variant={category.isActive ? "default" : "secondary"}>
                    {category.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span>
                    {category.productCount} product{category.productCount === 1 ? "" : "s"}
                  </span>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditing(category);
                        setForm({ name: category.name, description: category.description ?? "" });
                        setDialogOpen(true);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1" />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirm({ category, action: "toggle" })}
                    >
                      {category.isActive ? "Deactivate" : "Activate"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      onClick={() => setConfirm({ category, action: "delete" })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Category" : "Add Category"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              autoFocus
              placeholder="Category name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <Textarea
              placeholder="Description (optional)"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!form.name.trim() || save.isPending} onClick={() => save.mutate()}>
              {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!confirm} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.action === "delete"
                ? "Delete category?"
                : `${confirm?.category.isActive ? "Deactivate" : "Activate"} category?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.action === "delete"
                ? "Deletion is allowed only when no products use this category."
                : confirm?.category.isActive
                  ? "Existing products will keep this category, but it cannot be selected for new products."
                  : "This category will become selectable again."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirm && perform.mutate(confirm)}>
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
