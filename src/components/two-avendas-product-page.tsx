import { KpiCard } from "@/components/kpi-card";
import { VolumeBarChart } from "@/components/metrics-charts";
import { EventsTable } from "@/components/events-table";
import { TwoAvendasBillingUnlockCard } from "@/components/two-avendas-billing-unlock-card";
import { useRootLoaderData } from "@/hooks/use-root-loader-data";

export function TwoAvendasProductPage() {
  const { dashboard } = useRootLoaderData();

  if (!dashboard) {
    return (
      <div className="p-6 font-mono text-sm text-muted-foreground">Métricas indisponíveis nesta rota.</div>
    );
  }

  const chartDays = dashboard.meta.filtros.chart_days;
  const events = dashboard.events.filter((e) => e.app === "2avendas");
  const volume =
    dashboard.kpis.find((k) => k.label.toLowerCase().includes("2avendas")) ?? dashboard.kpis[2];
  const receita = dashboard.kpis.find((k) => k.label.toLowerCase().includes("receita")) ?? dashboard.kpis[0];
  const uptime = dashboard.kpis.find((k) => k.label.toLowerCase().includes("uptime")) ?? dashboard.kpis[3];
  const kpis = [volume, receita, uptime].filter(Boolean);
  const hasData = kpis.length > 0 || dashboard.avendasVolumePorDia.length > 0 || events.length > 0;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="font-mono text-xl font-semibold tracking-[0.15em]">2AVendas</h1>
        <p className="mt-1 font-mono text-xs text-muted-foreground">
          Desempenho de cadastro de clientes — série `dois_avendas.volume_por_dia` da API /dashboard.
        </p>
      </div>

      <TwoAvendasBillingUnlockCard />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {kpis.map((k) => (
          <KpiCard key={k.label} {...k} />
        ))}
      </div>
      {!hasData ? (
        <div className="rounded border border-dashed border-border/70 bg-card/30 p-4 font-mono text-xs text-muted-foreground">
          Sem dados de 2AVendas para o período/filtro atual.
        </div>
      ) : null}
      <VolumeBarChart data={dashboard.avendasVolumePorDia} chartDays={chartDays} />
      <EventsTable events={events} />
    </div>
  );
}
