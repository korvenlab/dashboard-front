import { createFileRoute } from "@tanstack/react-router";
import { KpiCard } from "@/components/kpi-card";
import { RevenueAreaChart } from "@/components/metrics-charts";
import { EventsTable } from "@/components/events-table";
import { useRootLoaderData } from "@/hooks/use-root-loader-data";

export const Route = createFileRoute("/wagoo")({
  head: () => ({ meta: [{ title: "Wagoo // Korven Lab" }] }),
  component: WagooPage,
});

function WagooPage() {
  const { dashboard } = useRootLoaderData();

  if (!dashboard) {
    return (
      <div className="p-6 font-mono text-sm text-muted-foreground">Métricas indisponíveis nesta rota.</div>
    );
  }

  const chartDays = dashboard.meta.filtros.chart_days;
  const events = dashboard.events.filter((e) => e.app === "wagoo" || e.app === "core");
  const primary =
    dashboard.kpis.find((k) => k.label.toLowerCase().includes("wagoo")) ?? dashboard.kpis[1];
  const receita = dashboard.kpis.find((k) => k.label.toLowerCase().includes("receita")) ?? dashboard.kpis[0];
  const uptime = dashboard.kpis.find((k) => k.label.toLowerCase().includes("uptime")) ?? dashboard.kpis[3];
  const kpis = [primary, receita, uptime].filter(Boolean);
  const hasData = kpis.length > 0 || dashboard.wagooReceitaPorDia.length > 0 || events.length > 0;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="font-mono text-xl font-semibold uppercase tracking-[0.2em]">Wagoo</h1>
        <p className="mt-1 font-mono text-xs text-muted-foreground">
          Usuários ativos e receita atual — série `wagoo.receita_por_dia` da API /dashboard.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {kpis.map((k) => (
          <KpiCard key={k.label} {...k} />
        ))}
      </div>
      {!hasData ? (
        <div className="rounded border border-dashed border-border/70 bg-card/30 p-4 font-mono text-xs text-muted-foreground">
          Sem dados de Wagoo para o período/filtro atual.
        </div>
      ) : null}
      <RevenueAreaChart data={dashboard.wagooReceitaPorDia} chartDays={chartDays} />
      <EventsTable events={events.length ? events : dashboard.events} />
    </div>
  );
}
