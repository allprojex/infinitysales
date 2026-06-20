import { createFileRoute } from "@tanstack/react-router";
import { sb, requireUser, json } from "./_resource-helpers";

function fallbackInsights(meta: any) {
  return {
    salesForecast: {
      next7DaysRevenue: Math.round(meta.currentRevenue / 4),
      next30DaysRevenue: meta.currentRevenue,
      confidence: "low",
      trend: meta.revenueGrowth > 5 ? "growing" : meta.revenueGrowth < -5 ? "declining" : "stable",
      trendPercent: meta.revenueGrowth,
      keyDrivers: ["Recent sales trend", "Historical patterns"],
      weeklyBreakdown: [],
      recommendations: ["Add more sales data to improve forecast quality."],
    },
    inventoryPrediction: { criticalItems: [], reorderSuggestions: [], expiryRisks: [], recommendations: [] },
    productRankings: {
      topByRevenue: (meta.topProductsByRevenue || []).slice(0, 5).map((p: any, i: number) => ({ ...p, rank: i + 1 })),
      bottomPerformers: [], fastMovers: [], slowMovers: [], recommendations: [],
    },
    inventoryTurnover: { overallTurnoverRate: 0, byCategory: [], recommendations: [] },
    stockAging: { agedItems: [], totalAgedValue: 0, recommendations: [] },
    profitabilityAnalysis: {
      overallGrossMarginPct: 0,
      byCategory: meta.categoryPerformance || [],
      highestMarginCategory: "—",
      lowestMarginCategory: "—",
      recommendations: [],
    },
    seasonalDemand: { currentSeason: "Current period", upcomingEvents: [], demandForecast: "Insufficient data", recommendations: [] },
    customerPatterns: { topSegment: "Walk-in", averageOrderValue: 0, peakShoppingHours: [], loyaltyInsights: "—", churnRisk: "Unknown", recommendations: [] },
    pricingRecommendations: { items: [], overallStrategy: "Maintain current pricing", recommendations: [] },
    cashFlow: {
      estimatedMonthlyRevenue: meta.currentRevenue,
      estimatedMonthlyCOGS: 0,
      estimatedGrossProfit: meta.currentRevenue,
      projectedNextMonth: meta.currentRevenue,
      cashFlowTrend: meta.revenueGrowth >= 0 ? "positive" : "negative",
      keyRisks: [],
      recommendations: [],
    },
    supplierPerformance: { overallInsight: "—", supplierRecommendations: [], categoriesNeedingAttention: [], recommendations: [] },
    fraudAlerts: { riskLevel: "low", flaggedTransactions: [], patterns: [], recommendations: [] },
    executiveSummary: `${meta.transactionCount} transactions analysed over the last 30 days. Revenue trend: ${meta.revenueGrowth >= 0 ? "+" : ""}${meta.revenueGrowth.toFixed(1)}%.`,
  };
}

export const Route = createFileRoute("/api/ai/insights")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireUser(request);
        if (auth.response) return auth.response;
        const userId = auth.user.id;
        const now = new Date();
        const start = new Date(now); start.setDate(start.getDate() - 30);
        const prevStart = new Date(now); prevStart.setDate(prevStart.getDate() - 60);

        const { data: sales } = await sb
          .from("sales")
          .select("id,total,tax,sold_at,customer_id,items,payment_method")
          .eq("user_id", userId)
          .gte("sold_at", start.toISOString())
          .order("sold_at", { ascending: false })
          .limit(500);
        const { data: prevSales } = await sb
          .from("sales")
          .select("total,sold_at")
          .eq("user_id", userId)
          .gte("sold_at", prevStart.toISOString())
          .lt("sold_at", start.toISOString());
        const { data: products } = await sb
          .from("products")
          .select("id,name,category,price,cost,stock")
          .limit(500);

        const currentRevenue = (sales || []).reduce((s, r: any) => s + Number(r.total || 0), 0);
        const prevRevenue = (prevSales || []).reduce((s, r: any) => s + Number(r.total || 0), 0);
        const revenueGrowth = prevRevenue > 0 ? ((currentRevenue - prevRevenue) / prevRevenue) * 100 : 0;

        // Aggregate by product across sales.items[]
        const productAgg = new Map<string, { name: string; revenue: number; units: number }>();
        for (const s of (sales || []) as any[]) {
          const items = Array.isArray(s.items) ? s.items : [];
          for (const it of items) {
            const name = it.name || it.productName || it.product_name || "Unknown";
            const qty = Number(it.qty ?? it.quantity ?? 1);
            const revenue = Number(it.total ?? (Number(it.price ?? 0) * qty));
            const cur = productAgg.get(name) || { name, revenue: 0, units: 0 };
            cur.revenue += revenue; cur.units += qty;
            productAgg.set(name, cur);
          }
        }
        const topProductsByRevenue = Array.from(productAgg.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 10);

        const categoryAgg = new Map<string, { category: string; revenue: number; estimatedCost: number; units: number }>();
        for (const p of (products || []) as any[]) {
          const cat = p.category || "Uncategorized";
          const cur = categoryAgg.get(cat) || { category: cat, revenue: 0, estimatedCost: 0, units: 0 };
          categoryAgg.set(cat, cur);
        }
        const categoryPerformance = Array.from(categoryAgg.values()).map(c => ({ ...c, grossMarginPct: 0 }));

        const meta = {
          generatedAt: new Date().toISOString(),
          dataWindow: "Last 30 days",
          transactionCount: (sales || []).length,
          currentRevenue,
          prevRevenue,
          revenueGrowth,
          suspiciousTxCount: 0,
          totalProducts: (products || []).length,
          topProductsByRevenue,
          categoryPerformance,
        };

        // Try Lovable AI for richer insights; fall back to deterministic shape.
        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey || (sales || []).length === 0) {
          return json({ insights: fallbackInsights(meta), meta });
        }

        const prompt = `You are a retail analytics assistant. Given the following summary, return a JSON object that matches this TypeScript interface exactly:

interface AIInsights {
  salesForecast: { next7DaysRevenue: number; next30DaysRevenue: number; confidence: "high"|"medium"|"low"; trend: "growing"|"stable"|"declining"; trendPercent: number; keyDrivers: string[]; weeklyBreakdown?: { week: string; projectedRevenue: number; notes: string }[]; recommendations: string[]; };
  inventoryPrediction: { criticalItems: { name: string; currentStock: number; daysUntilStockout: number; urgency: "critical"|"high"|"medium" }[]; reorderSuggestions: { name: string; suggestedQty: number; reason: string; estimatedCost?: number }[]; expiryRisks: { name: string; expiryDate: string; stock: number; action: string }[]; recommendations: string[]; };
  productRankings: { topByRevenue: { name: string; revenue: number; units: number; rank: number }[]; bottomPerformers: { name: string; revenue: number; units: number; reason: string }[]; fastMovers: { name: string; insight: string }[]; slowMovers: { name: string; stock: number; recommendation: string }[]; recommendations: string[]; };
  inventoryTurnover: { overallTurnoverRate: number; byCategory: { category: string; turnoverRate: number; avgDaysInStock: number; status: "fast"|"normal"|"slow" }[]; recommendations: string[]; };
  stockAging: { agedItems: { name: string; estimatedDaysInStock: number; stock: number; action: string }[]; totalAgedValue: number; recommendations: string[]; };
  profitabilityAnalysis: { overallGrossMarginPct: number; byCategory: { category: string; revenue: number; estimatedProfit: number; marginPct: number }[]; highestMarginCategory: string; lowestMarginCategory: string; recommendations: string[]; };
  seasonalDemand: { currentSeason: string; upcomingEvents: { event: string; timing: string; expectedImpact: string; productsToStock: string[] }[]; demandForecast: string; recommendations: string[]; };
  customerPatterns: { topSegment: string; averageOrderValue: number; peakShoppingHours: string[]; loyaltyInsights: string; churnRisk: string; paymentMethodInsights?: string; recommendations: string[]; };
  pricingRecommendations: { items: { name: string; currentPrice: number; suggestedPrice: number; rationale: string; expectedImpact: string }[]; overallStrategy: string; recommendations: string[]; };
  cashFlow: { estimatedMonthlyRevenue: number; estimatedMonthlyCOGS: number; estimatedGrossProfit: number; projectedNextMonth: number; cashFlowTrend: "positive"|"neutral"|"negative"; keyRisks: string[]; recommendations: string[]; };
  supplierPerformance: { overallInsight: string; supplierRecommendations: { supplier: string; insight: string; action: string }[]; categoriesNeedingAttention: string[]; recommendations: string[]; };
  fraudAlerts: { riskLevel: "high"|"medium"|"low"; flaggedTransactions: { id: number; amount: number; reason: string; date: string }[]; patterns: string[]; recommendations: string[]; };
  executiveSummary: string;
}

DATA:
${JSON.stringify(meta).slice(0, 6000)}

Return ONLY the JSON object, no markdown, no commentary.`;

        try {
          const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [{ role: "user", content: prompt }],
              response_format: { type: "json_object" },
            }),
          });
          if (!resp.ok) throw new Error(`AI gateway ${resp.status}`);
          const ai = await resp.json();
          const content = ai?.choices?.[0]?.message?.content ?? "{}";
          const insights = JSON.parse(content);
          return json({ insights, meta });
        } catch (e) {
          console.error("[ai.insights]", e);
          return json({ insights: fallbackInsights(meta), meta });
        }
      },
    },
  },
});
