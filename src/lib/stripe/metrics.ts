import type Stripe from "stripe";
import type { AppEvent, Kpi } from "@/lib/metrics";
import {
  formatBrl,
  formatPercent,
  type ChartPointReceita,
  type ChartPointVolume,
  type DashboardMeta,
  type DashboardViewModel,
} from "@/lib/dashboard-view";
import { getStripeClient, paginateStripe } from "@/lib/stripe/client";
import { getStripeServerEnv } from "@/lib/server-env";

export type StripeMetricsFilters = DashboardMeta["filtros"];

type MoneyWindow = {
  start: number;
  end: number;
};

function dayKeyFromUnix(unix: number): string {
  return new Date(unix * 1000).toISOString().slice(0, 10);
}

function daySeries(days: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function windowForPeriod(periodDays: number): { current: MoneyWindow; previous: MoneyWindow } {
  const now = Math.floor(Date.now() / 1000);
  const currentStart = now - periodDays * 86_400;
  const previousStart = currentStart - periodDays * 86_400;
  return {
    current: { start: currentStart, end: now },
    previous: { start: previousStart, end: currentStart },
  };
}

function deltaPct(current: number, previous: number): number | undefined {
  if (previous <= 0) return undefined;
  return ((current - previous) / previous) * 100;
}

function matchesOrganization(
  metadata: Stripe.Metadata | null | undefined,
  organizationId: string | undefined,
): boolean {
  if (!organizationId) return true;
  const org = metadata?.organization_id ?? metadata?.org_id;
  return org === organizationId;
}

function isWagooCharge(charge: Stripe.Charge, wagooPriceIds: Set<string>): boolean {
  if (charge.metadata?.app === "wagoo" || charge.metadata?.product === "wagoo") return true;
  const priceId = charge.metadata?.price_id;
  if (priceId && wagooPriceIds.has(priceId)) return true;
  const invoice = (charge as Stripe.Charge & { invoice?: string | null }).invoice;
  return invoice != null;
}

function isAvendasCharge(charge: Stripe.Charge, avendasPriceIds: Set<string>): boolean {
  if (
    charge.metadata?.app === "2avendas" ||
    charge.metadata?.app === "avendas" ||
    charge.metadata?.product === "2avendas"
  ) {
    return true;
  }
  const priceId = charge.metadata?.price_id;
  if (priceId && avendasPriceIds.has(priceId)) return true;
  const invoice = (charge as Stripe.Charge & { invoice?: string | null }).invoice;
  return invoice == null;
}

function chargeAmountBrl(charge: Stripe.Charge): number {
  return (charge.amount - (charge.amount_refunded ?? 0)) / 100;
}

async function listPaidCharges(
  stripe: Stripe,
  window: MoneyWindow,
  organizationId?: string,
): Promise<Stripe.Charge[]> {
  const charges = await paginateStripe((startingAfter) =>
    stripe.charges.list({
      created: { gte: window.start, lte: window.end },
      limit: 100,
      starting_after: startingAfter,
    }),
  );

  return charges.filter(
    (c) => c.paid && !c.refunded && matchesOrganization(c.metadata, organizationId),
  );
}

async function countActiveSubscriptions(
  stripe: Stripe,
  organizationId?: string,
): Promise<number> {
  const subs = await paginateStripe((startingAfter) =>
    stripe.subscriptions.list({
      status: "active",
      limit: 100,
      starting_after: startingAfter,
      expand: ["data.customer"],
    }),
  );

  if (!organizationId) return subs.length;

  return subs.filter((sub) => {
    const customer = sub.customer;
    if (typeof customer === "string" || customer.deleted) return false;
    return matchesOrganization(customer.metadata, organizationId);
  }).length;
}

function buildKpis(
  receitaTotal: number,
  receitaDelta: number | undefined,
  assinaturas: number,
  volumeAvendas: number,
  volumeDelta: number | undefined,
): Kpi[] {
  const receitaDeltaStr =
    receitaDelta !== undefined ? `${receitaDelta >= 0 ? "+" : ""}${receitaDelta.toFixed(1)}%` : "—";
  const volumeDeltaStr =
    volumeDelta !== undefined ? `${volumeDelta >= 0 ? "+" : ""}${volumeDelta.toFixed(1)}%` : "—";

  return [
    {
      label: "Receita Total",
      value: formatBrl(receitaTotal),
      delta: receitaDeltaStr,
      trend: receitaDelta === undefined || receitaDelta >= 0 ? "up" : "down",
    },
    {
      label: "Assinaturas Ativas (Wagoo)",
      value: assinaturas.toLocaleString("pt-BR"),
      delta: "—",
      trend: "up",
    },
    {
      label: "Volume de Vendas (2AVENDAS)",
      value: volumeAvendas.toLocaleString("pt-BR"),
      delta: volumeDeltaStr,
      trend: volumeDelta === undefined || volumeDelta >= 0 ? "up" : "down",
    },
    {
      label: "Uptime Médio",
      value: formatPercent(99.92),
      delta: "—",
      trend: "up",
    },
  ];
}

function buildEvents(generatedAt: string, receitaTotal: number, assinaturas: number): AppEvent[] {
  const time = new Date(generatedAt).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  return [
    {
      id: "stripe-sync",
      app: "core",
      status: "online",
      message: `Stripe sincronizado — receita ${formatBrl(receitaTotal)}, ${assinaturas} assinaturas ativas`,
      timestamp: time,
    },
  ];
}

export async function fetchStripeDashboard(
  filtros: StripeMetricsFilters,
): Promise<{ vm: DashboardViewModel | null; error?: string }> {
  const stripe = getStripeClient();
  if (!stripe) {
    return {
      vm: null,
      error: "Defina STRIPE_SECRET_KEY no servidor (Vercel).",
    };
  }

  const { wagooPriceIds, avendasPriceIds } = getStripeServerEnv();
  const wagooPrices = new Set(wagooPriceIds);
  const avendasPrices = new Set(avendasPriceIds);

  const windows = windowForPeriod(filtros.period_days);
  const chartStart = Math.floor(Date.now() / 1000) - filtros.chart_days * 86_400;

  try {
    const [currentCharges, previousCharges, assinaturas, chartCharges] = await Promise.all([
      listPaidCharges(stripe, windows.current, filtros.organization_id),
      listPaidCharges(stripe, windows.previous, filtros.organization_id),
      countActiveSubscriptions(stripe, filtros.organization_id),
      listPaidCharges(stripe, { start: chartStart, end: windows.current.end }, filtros.organization_id),
    ]);

    const receitaTotal = currentCharges.reduce((sum, c) => sum + chargeAmountBrl(c), 0);
    const receitaPrev = previousCharges.reduce((sum, c) => sum + chargeAmountBrl(c), 0);

    const avendasCharges = currentCharges.filter((c) => isAvendasCharge(c, avendasPrices));
    const avendasPrev = previousCharges.filter((c) => isAvendasCharge(c, avendasPrices));

    const wagooReceitaMap = new Map<string, number>();
    const avendasVolumeMap = new Map<string, number>();

    for (const charge of chartCharges) {
      const day = dayKeyFromUnix(charge.created);
      if (isWagooCharge(charge, wagooPrices)) {
        wagooReceitaMap.set(day, (wagooReceitaMap.get(day) ?? 0) + chargeAmountBrl(charge));
      }
      if (isAvendasCharge(charge, avendasPrices)) {
        avendasVolumeMap.set(day, (avendasVolumeMap.get(day) ?? 0) + 1);
      }
    }

    const days = daySeries(filtros.chart_days);
    const wagooReceitaPorDia: ChartPointReceita[] = days.map((d) => ({
      t: d.slice(5, 10),
      receita: wagooReceitaMap.get(d) ?? 0,
    }));
    const avendasVolumePorDia: ChartPointVolume[] = days.map((d) => ({
      t: d.slice(5, 10),
      volume: avendasVolumeMap.get(d) ?? 0,
    }));

    const generatedAt = new Date().toISOString();
    const kpis = buildKpis(
      receitaTotal,
      deltaPct(receitaTotal, receitaPrev),
      assinaturas,
      avendasCharges.length || currentCharges.length,
      deltaPct(avendasCharges.length, avendasPrev.length),
    );

    return {
      vm: {
        meta: {
          source: "api",
          ok: true,
          gerado_em: generatedAt,
          filtros,
        },
        kpis,
        wagooReceitaPorDia,
        avendasVolumePorDia,
        events: buildEvents(generatedAt, receitaTotal, assinaturas),
        ui: {
          topbar: {
            title: "Dashboard Korven",
            subtitle: "Stripe · Wagoo + 2AVENDAS",
          },
        },
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { vm: null, error: `Stripe: ${msg}` };
  }
}
