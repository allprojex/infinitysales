import { createFileRoute } from "@tanstack/react-router";
import { sb, requireUser, json, errorJson } from "./_resource-helpers";

const defaultRates = {
  vat_rate: 15,
  nhil_rate: 2.5,
  getfund_rate: 2.5,
  covid_levy: 0,
};

async function loadRates(userId: string) {
  const { data, error } = await sb
    .from("user_tax_rates")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return { user_id: userId, ...defaultRates };
  if (data) return { ...defaultRates, ...data };
  const { data: created } = await sb
    .from("user_tax_rates")
    .insert({ user_id: userId, ...defaultRates })
    .select("*")
    .maybeSingle();
  return created ? { ...defaultRates, ...created } : { user_id: userId, ...defaultRates };
}

export function rateValue(value: unknown, fallback: number) {
  if (value === null || value === undefined) {
    return fallback;
  }

  if (typeof value === "string" && value.trim() === "") {
    return fallback;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const Route = createFileRoute("/api/vat-report")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireUser(request);
        if (auth.response) return auth.response;
        const url = new URL(request.url);
        const startDate =
          url.searchParams.get("startDate") ??
          new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
        const endDate = url.searchParams.get("endDate") ?? new Date().toISOString().slice(0, 10);

        const rates = { ...defaultRates, ...(await loadRates(auth.user.id)) };
        const vatRate = rateValue(rates.vat_rate, defaultRates.vat_rate);
        const nhilRate = rateValue(rates.nhil_rate, defaultRates.nhil_rate);
        const getfundRate = rateValue(rates.getfund_rate, defaultRates.getfund_rate);
        const covidLevy = rateValue(rates.covid_levy, defaultRates.covid_levy);
        const totalTaxRate = vatRate + nhilRate + getfundRate + covidLevy;

        const { data: sales } = await sb
          .from("sales")
          .select("id,reference,sold_at,total,tax,customer_id,payment_method,status")
          .eq("user_id", auth.user.id)
          .gte("sold_at", startDate)
          .lte("sold_at", endDate + "T23:59:59")
          .order("sold_at", { ascending: false })
          .limit(1000);

        const list = sales ?? [];
        const customerIds = Array.from(
          new Set(list.map((r: any) => r.customer_id).filter(Boolean)),
        );
        const nameMap = new Map<string, string>();
        if (customerIds.length) {
          const { data: cs } = await (sb as any)
            .from("customers")
            .select("id,uuid_id,name")
            .eq("user_id", auth.user.id)
            .in("uuid_id", customerIds);
          for (const c of cs ?? []) {
            nameMap.set(String((c as any).uuid_id ?? (c as any).id), (c as any).name);
          }
        }

        const grossRevenue = list.reduce((s, r: any) => s + Number(r.total || 0), 0);
        const taxFactor = 1 + totalTaxRate / 100;
        const taxExclusive = taxFactor > 0 ? grossRevenue / taxFactor : grossRevenue;
        const totalTax = grossRevenue - taxExclusive;
        const safeTotal = totalTaxRate || 1;
        const vatAmount = totalTax * (vatRate / safeTotal);
        const nhilAmount = totalTax * (nhilRate / safeTotal);
        const getfundAmount = totalTax * (getfundRate / safeTotal);
        const covidLevyAmount = totalTax * (covidLevy / safeTotal);
        const taxCollectedSystem = list.reduce((s, r: any) => s + Number(r.tax || 0), 0);

        const byMonth = new Map<string, any>();
        for (const r of list as any[]) {
          const d = new Date(r.sold_at);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          const gross = Number(r.total || 0);
          const excl = gross / taxFactor;
          const tax = gross - excl;
          const cur = byMonth.get(key) || {
            month: d.toLocaleString("en-US", { month: "short", year: "numeric" }),
            month_key: key,
            sales_count: 0,
            gross: 0,
            exclusive: 0,
            vat: 0,
            nhil: 0,
            getfund: 0,
          };
          cur.sales_count += 1;
          cur.gross += gross;
          cur.exclusive += excl;
          cur.vat += tax * (vatRate / safeTotal);
          cur.nhil += tax * (nhilRate / safeTotal);
          cur.getfund += tax * (getfundRate / safeTotal);
          byMonth.set(key, cur);
        }
        const monthly = Array.from(byMonth.values())
          .sort((a, b) => b.month_key.localeCompare(a.month_key))
          .map((m) => ({
            ...m,
            gross: m.gross.toFixed(2),
            exclusive: m.exclusive.toFixed(2),
            vat: m.vat.toFixed(2),
            nhil: m.nhil.toFixed(2),
            getfund: m.getfund.toFixed(2),
          }));

        const byMethodMap = new Map<string, any>();
        for (const r of list as any[]) {
          const m = r.payment_method || "unknown";
          const gross = Number(r.total || 0);
          const tax = gross - gross / taxFactor;
          const cur = byMethodMap.get(m) || { method: m, sales_count: 0, gross: 0, vat: 0 };
          cur.sales_count += 1;
          cur.gross += gross;
          cur.vat += tax * (vatRate / safeTotal);
          byMethodMap.set(m, cur);
        }
        const byMethod = Array.from(byMethodMap.values()).map((m) => ({
          ...m,
          gross: m.gross.toFixed(2),
          vat: m.vat.toFixed(2),
        }));

        const salesOut = list.slice(0, 200).map((r: any) => {
          const gross = Number(r.total || 0);
          const excl = gross / taxFactor;
          const tax = gross - excl;
          return {
            id: r.id,
            invoice_number: r.reference,
            sale_date: r.sold_at,
            gross: gross.toFixed(2),
            exclusive: excl.toFixed(2),
            vat: (tax * (vatRate / safeTotal)).toFixed(2),
            nhil: (tax * (nhilRate / safeTotal)).toFixed(2),
            getfund: (tax * (getfundRate / safeTotal)).toFixed(2),
            customer_name: (r.customer_id && nameMap.get(String(r.customer_id))) || "Walk-in",
            payment_method: r.payment_method,
          };
        });

        return json({
          startDate,
          endDate,
          rates: { vatRate, nhilRate, getfundRate, covidLevy, totalTaxRate },
          summary: {
            totalSales: list.length,
            grossRevenue,
            taxExclusive,
            vatAmount,
            nhilAmount,
            getfundAmount,
            covidLevyAmount,
            totalTaxCollected: totalTax,
            taxCollectedSystem,
          },
          monthly,
          byMethod,
          sales: salesOut,
        });
      },
    },
  },
});
