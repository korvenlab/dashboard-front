import { createFileRoute } from "@tanstack/react-router";
import { KpiCard } from "@/components/kpi-card";
import { RevenueAreaChart, VolumeBarChart } from "@/components/metrics-charts";
import { EventsTable } from "@/components/events-table";
import { KorvenDashboardEmptyHint, useKorvenDashboard } from "@/lib/dashboard-context";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { dashboard } = useKorvenDashboard();

  if (!dashboard) {
    return (
      <div className="p-10">
        <KorvenDashboardEmptyHint />
      </div>
    );
  }

  const chartDays = dashboard.meta.filtros.chart_days;
  const topRow = dashboard.kpis.slice(0, 4);
  const wagooKpi =
    dashboard.kpis.find((k) => k.label.toLowerCase().includes("wagoo")) ?? dashboard.kpis[1];
  const vendasKpi =
    dashboard.kpis.find((k) => k.label.toLowerCase().includes("2avendas")) ?? dashboard.kpis[2];

  return (
    <div className="space-y-10 p-10">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-mono text-xl font-semibold uppercase tracking-[0.2em] text-foreground">
            Visão Geral
          </h1>
          <p className="mt-2 font-mono text-xs text-muted-foreground">
            Telemetria consolidada Wagoo + 2AVendas com foco em valor atual e desempenho de cadastros.
          </p>
        </div>
      </div>

      <section className="grid grid-cols-1 gap-8 md:grid-cols-2 xl:grid-cols-4">
        {topRow.map((k) => (
          <KpiCard key={k.label} {...k} />
        ))}
      </section>

      <div className="h-px w-full bg-border" />

      <section className="space-y-6">
        <header className="flex items-baseline justify-between">
          <h2 className="font-mono text-sm uppercase tracking-[0.3em] text-foreground">Wagoo</h2>
          <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
            receita por dia (API)
          </span>
        </header>
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {wagooKpi ? <KpiCard {...wagooKpi} /> : null}
          <div className="lg:col-span-2">
            <RevenueAreaChart data={dashboard.wagooReceitaPorDia} chartDays={chartDays} />
          </div>
        </div>
      </section>

      <div className="h-px w-full bg-border" />

      <section className="space-y-6">
        <header className="flex items-baseline justify-between">
          <h2 className="font-mono text-sm tracking-[0.2em] text-foreground">2AVendas</h2>
          <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
            desempenho de cadastro (período)
          </span>
        </header>
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {vendasKpi ? <KpiCard {...vendasKpi} /> : null}
          <div className="lg:col-span-2">
            <VolumeBarChart data={dashboard.avendasVolumePorDia} chartDays={chartDays} />
          </div>
        </div>
      </section>

      <div className="h-px w-full bg-border" />

      <section>
        <EventsTable events={dashboard.events} />
      </section>
    </div>
  );
}
