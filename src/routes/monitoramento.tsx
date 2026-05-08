import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { fetchUptimeMonitoring, type UptimeMonitoringResponse } from "@/lib/monitoring-api";

export const Route = createFileRoute("/monitoramento")({
  component: MonitoringPage,
});

function statusClass(status: string): string {
  if (status.toLowerCase() === "online") return "border-emerald-500/50 bg-emerald-500/10 text-emerald-300";
  if (status.toLowerCase() === "offline") return "border-rose-500/50 bg-rose-500/10 text-rose-300";
  return "border-amber-500/50 bg-amber-500/10 text-amber-300";
}

function countRecentIncidents(logs: unknown[]): number {
  return logs.reduce<number>((acc, item) => {
    if (!item || typeof item !== "object") return acc;
    const status = (item as { type?: number | string }).type;
    const statusCode = Number(status);
    return statusCode === 1 || statusCode === 2 ? acc + 1 : acc;
  }, 0);
}

function latestResponseMs(responseTimes: unknown[]): number | null {
  for (let i = responseTimes.length - 1; i >= 0; i -= 1) {
    const item = responseTimes[i];
    if (!item || typeof item !== "object") continue;
    const value = Number((item as { value?: number | string }).value);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function MonitoringPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<UptimeMonitoringResponse | null>(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const result = (await fetchUptimeMonitoring({ data: {} })) as UptimeMonitoringResponse;
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-xl font-semibold uppercase tracking-[0.2em]">Monitoramento</h1>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            Visão completa dos monitores via API do UptimeRobot.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded border border-border px-3 py-1.5 font-mono text-xs uppercase tracking-wider hover:bg-card"
          disabled={loading}
        >
          {loading ? "Atualizando..." : "Atualizar"}
        </button>
      </div>

      {error ? (
        <div className="rounded border border-rose-500/50 bg-rose-500/10 px-3 py-2 font-mono text-xs text-rose-300">
          {error}
        </div>
      ) : null}

      {data ? (
        <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded border border-border bg-card/40 p-3">
            <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Total de monitores</div>
            <div className="mt-1 font-mono text-2xl">{data.total}</div>
          </div>
          <div className="rounded border border-border bg-card/40 p-3">
            <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Status API</div>
            <div className="mt-1 font-mono text-2xl">{data.stat}</div>
          </div>
          <div className="rounded border border-border bg-card/40 p-3">
            <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Última atualização</div>
            <div className="mt-1 font-mono text-sm">{new Date(data.fetchedAt).toLocaleString("pt-BR")}</div>
          </div>
        </section>
      ) : null}

      <section className="overflow-x-auto rounded border border-border">
        <table className="w-full min-w-[1100px] border-collapse">
          <thead>
            <tr className="border-b border-border bg-card">
              <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider">Monitor</th>
              <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider">Status</th>
              <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider">Código</th>
              <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider">URL</th>
              <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider">Uptime</th>
              <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider">Intervalo</th>
              <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider">Incidentes</th>
              <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider">Latência Atual</th>
            </tr>
          </thead>
          <tbody>
            {data?.monitors.map((m) => (
              (() => {
                const currentMs = latestResponseMs(m.responseTimes);
                return (
                  <tr key={`${m.id ?? m.name}`} className="border-b border-border/50">
                    <td className="px-3 py-2 font-mono text-xs">{m.name}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded border px-2 py-0.5 font-mono text-xs ${statusClass(m.status)}`}>
                        {m.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{m.statusCode}</td>
                    <td className="px-3 py-2 font-mono text-xs">{m.url ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{m.uptimeRatio ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{m.interval ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{countRecentIncidents(m.logs)}</td>
                    <td className="px-3 py-2 font-mono text-xs">{currentMs !== null ? `${currentMs} ms` : "—"}</td>
                  </tr>
                );
              })()
            ))}
            {!loading && (!data || data.monitors.length === 0) ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center font-mono text-xs text-muted-foreground">
                  Nenhum monitor retornado pela API.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
