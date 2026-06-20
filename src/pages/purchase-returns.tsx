import { Undo2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function PurchaseReturns() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Purchase Returns</h2>
        <p className="text-muted-foreground">Manage returns to suppliers and vendors.</p>
      </div>
      <Card>
        <CardHeader className="flex flex-row items-center gap-4">
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Undo2 className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>Purchase Returns Module</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            The Purchase Returns module handles sending defective or unwanted stock back to suppliers,
            tracks debit notes, and updates inventory accordingly. This feature is coming soon.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
