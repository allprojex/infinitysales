import { RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SalesReturns() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Sales Returns</h2>
        <p className="text-muted-foreground">Process and track returned goods from customers.</p>
      </div>
      <Card>
        <CardHeader className="flex flex-row items-center gap-4">
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <RotateCcw className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>Sales Returns Module</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            The Sales Returns module allows you to handle customer return requests, issue credit
            notes, and restock returned items to inventory. This feature is coming soon.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
